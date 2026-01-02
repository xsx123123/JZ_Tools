use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use chrono::Utc;
use futures::future::BoxFuture;
use futures::stream::{self, StreamExt, TryStreamExt};
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use log::{debug, info};
use md5::Context as Md5Context;
use reqwest::Client;
use std::collections::HashMap;
use std::fs::File;
use std::future::Future;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::Duration;
use tokio::runtime::Handle;

// --- SDK Imports ---
use ve_tos_rust_sdk::asynchronous::tos::{self, AsyncRuntime, TosClient};
use ve_tos_rust_sdk::multipart::{
    CreateMultipartUploadInput, 
    UploadPartFromBufferInput, 
    CompleteMultipartUploadInput,
    UploadedPart 
};
use ve_tos_rust_sdk::object::SetObjectMetaInput;

// --- 1. 异步 Runtime 适配器 ---
#[derive(Debug, Default, Clone)]
pub struct TokioRuntime {}

#[async_trait]
impl AsyncRuntime for TokioRuntime {
    type JoinError = tokio::task::JoinError;
    async fn sleep(&self, duration: Duration) {
        tokio::time::sleep(duration).await;
    }
    fn spawn<'a, F>(&self, future: F) -> BoxFuture<'a, Result<F::Output, Self::JoinError>>
    where
        F: Future + Send + 'static,
        F::Output: Send + 'static,
    {
        Box::pin(Handle::current().spawn(future))
    }
    fn block_on<F: Future>(&self, future: F) -> F::Output {
        Handle::current().block_on(future)
    }
}

// --- 2. 预检查逻辑 ---
pub async fn check_prerequisites(endpoint: &str, ak: &Option<String>, sk: &Option<String>) -> Result<()> {
    info!("🔍 [Cloud] 正在执行云端环境预检查...");
    if ak.is_none() || ak.as_ref().unwrap().is_empty() {
        return Err(anyhow!("❌ 未检测到 TOS_ACCESS_KEY"));
    }
    if sk.is_none() || sk.as_ref().unwrap().is_empty() {
        return Err(anyhow!("❌ 未检测到 TOS_SECRET_KEY"));
    }
    
    let client = Client::builder().timeout(Duration::from_secs(5)).build()?;
    match client.head(endpoint).send().await {
        Ok(_) => debug!("✅ 网络连通性检查通过"),
        Err(e) => return Err(anyhow!("❌ 无法连接到 TOS Endpoint ({}): {}", endpoint, e)),
    }
    info!("✅ 云端预检查全部通过");
    Ok(())
}

// --- 3. 核心上传逻辑 (手动并发分片版) ---

pub async fn upload_and_set_meta(
    client: &impl TosClient, 
    bucket: &str,
    key: &str,
    file_path: &Path,
    project_id: &str,
    extra_meta_str: &Option<String>,
    part_size_mb: u64,
    task_num: usize,
    mp: Option<&MultiProgress>,
    file_index: usize,
    total_files: usize,
) -> Result<(usize, String)> {
    
    let file_name = file_path.file_name().unwrap().to_string_lossy().to_string();
    let file_size = std::fs::metadata(file_path)?.len();

    // 1. 流式计算 MD5
    debug!("正在计算文件 MD5: {}", file_name);
    let md5_str = compute_file_md5(file_path)?;
    debug!("File: {}, Size: {}, MD5: {}", file_name, file_size, md5_str);

    // 2. 初始化分片上传
    info!("🚀 初始化上传: {} (Total: {} bytes)", file_name, file_size);
    let mut create_input = CreateMultipartUploadInput::new(bucket.to_string(), key.to_string());
    create_input.set_content_type("application/octet-stream");
    
    let create_output = client.create_multipart_upload(&create_input).await
        .map_err(|e| anyhow!("InitUpload Failed: {:?}", e))?;
    let upload_id = create_output.upload_id();

    // 3. 计算分片计划
    let min_part_size = 5 * 1024 * 1024;
    let user_part_size = part_size_mb * 1024 * 1024;
    let part_size = if user_part_size < min_part_size {
        log::warn!("⚠️ 设置的分片大小 {}MB 小于最小限制 5MB，已自动调整为 5MB", part_size_mb);
        min_part_size
    } else {
        user_part_size
    };

    let mut parts_plan = Vec::new();
    let mut offset = 0;
    let mut part_number = 1;

    while offset < file_size {
        let length = std::cmp::min(part_size, file_size - offset);
        parts_plan.push((part_number, offset, length));
        offset += length;
        part_number += 1;
    }

    info!("📦 分片计划: 共 {} 片, 并发数 {}, 单片大小 {} MB", parts_plan.len(), task_num, part_size / 1024 / 1024);

    let pb = mp.map(|m| {
        let p = m.add(ProgressBar::new(file_size));
        p.set_style(ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {bytes}/{total_bytes} ({bytes_per_sec}, {eta}) {msg}")
            .unwrap()
            .progress_chars("=>-"));
        p.set_message(format!("Uploading: {} [{}/{}]", file_name, file_index, total_files));
        p
    });

    // 4. 并发上传分片
    let upload_results: Vec<UploadedPart> = stream::iter(parts_plan)
        .map(|(p_num, p_offset, p_len)| {
            let bucket = bucket.to_string();
            let key = key.to_string();
            let up_id = upload_id.to_string();
            let f_path = file_path.to_owned(); 
            let pb = pb.clone();

            async move {
                let mut file = File::open(&f_path)?;
                file.seek(SeekFrom::Start(p_offset))?;
                let mut buffer = vec![0u8; p_len as usize];
                file.read_exact(&mut buffer)?;

                let mut part_input = UploadPartFromBufferInput::new(bucket, key, up_id);
                part_input.set_part_number(p_num);
                part_input.set_content(buffer);
                
                let output = client.upload_part_from_buffer(&part_input).await
                    .map_err(|e| anyhow!("Part {} Fail: {:?}", p_num, e))?;
                
                if let Some(p) = pb {
                    p.inc(p_len);
                }
                debug!("Part {} done ({} bytes)", p_num, p_len);
                Ok::<UploadedPart, anyhow::Error>(UploadedPart::new(p_num, output.etag()))
            }
        })
        .buffer_unordered(task_num)
        .try_collect()
        .await?;

    if let Some(p) = pb {
        p.finish_and_clear();
    }

    // ⚠️ 修复点在此：使用 part_number() 方法而不是直接访问字段
    let mut sorted_parts = upload_results;
    sorted_parts.sort_by_key(|p| p.part_number());

    // 5. 完成分片上传
    let mut complete_input = CompleteMultipartUploadInput::new(
        bucket.to_string(), 
        key.to_string(), 
        upload_id.to_string()
    );
    complete_input.set_parts(sorted_parts);

    let complete_output = client.complete_multipart_upload(&complete_input).await
        .map_err(|e| anyhow!("CompleteUpload Failed: {:?}", e))?;
    
    let req_id = complete_output.request_id().to_string();
    info!("✅ 上传完成: {}", key);

    // 6. 设置元数据
    let mut meta_input = SetObjectMetaInput::new(bucket.to_string(), key.to_string());
    meta_input.set_content_type("application/octet-stream");
    
    let mut user_meta = HashMap::new();
    user_meta.insert("sample_name".to_string(), file_name);
    user_meta.insert("project_id".to_string(), project_id.to_string());
    user_meta.insert("content_md5".to_string(), md5_str);
    user_meta.insert("transfer_time".to_string(), Utc::now().to_rfc3339());
    user_meta.insert("tool".to_string(), "data_deliver_v0.6".to_string());

    if let Some(meta_str) = extra_meta_str {
        for pair in meta_str.split(';') {
            if let Some((k, v)) = pair.split_once(':') {
                if !k.trim().is_empty() {
                    user_meta.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }
    }
    meta_input.set_meta(user_meta);

    client.set_object_meta(&meta_input).await
        .map_err(|e| anyhow!("SetMeta Failed: {:?}", e))?;

    Ok((file_size as usize, req_id))
}

pub fn create_client(endpoint: &str, region: &str, ak: &str, sk: &str) -> Result<impl TosClient> {
    tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(60_000) 
        .max_retry_count(3)
        .ak(ak).sk(sk)
        .region(region).endpoint(endpoint)
        .build()
        .context("TOS Client Build Failed")
}

fn compute_file_md5(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut context = Md5Context::new();
    let mut buffer = [0; 64 * 1024]; // 64KB buffer
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        context.consume(&buffer[..count]);
    }
    Ok(format!("{:x}", context.compute()))
}