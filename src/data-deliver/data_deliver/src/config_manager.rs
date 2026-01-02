use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose, Engine as _};
use dirs::home_dir;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// 固定密钥 (在实际生产中通常不建议硬编码，但对于本地工具的轻量级混淆/加密已足够)
// 这是一个随机生成的 32 字节 Key
const SECRET_KEY: &[u8; 32] = b"data_deliver_local_secret_key_32";

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub endpoint: Option<String>,
    pub region: Option<String>,
    pub ak_encrypted: Option<String>,
    pub sk_encrypted: Option<String>,
}

impl AppConfig {
    pub fn decrypt_ak(&self) -> Result<Option<String>> {
        if let Some(enc) = &self.ak_encrypted {
            Ok(Some(decrypt_string(enc)?))
        } else {
            Ok(None)
        }
    }

    pub fn decrypt_sk(&self) -> Result<Option<String>> {
        if let Some(enc) = &self.sk_encrypted {
            Ok(Some(decrypt_string(enc)?))
        } else {
            Ok(None)
        }
    }
}

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Result<Self> {
        let home = home_dir().ok_or_else(|| anyhow::anyhow!("无法找到用户主目录"))?;
        let config_dir = home.join(".data_deliver");
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }
        let config_path = config_dir.join("config.yaml");
        Ok(Self { config_path })
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.config_path.exists() {
            return Ok(AppConfig::default());
        }
        let content = fs::read_to_string(&self.config_path)?;
        let config: AppConfig = serde_yaml::from_str(&content).context("解析配置文件失败")?;
        Ok(config)
    }

    pub fn save(&self, config: &AppConfig) -> Result<()> {
        let content = serde_yaml::to_string(config)?;
        // 限制文件权限 (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if self.config_path.exists() {
                let mut perms = fs::metadata(&self.config_path)?.permissions();
                perms.set_mode(0o600);
                fs::set_permissions(&self.config_path, perms)?;
            }
        }
        
        fs::write(&self.config_path, content)?;
        
        // 再次确保创建后的权限
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&self.config_path)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&self.config_path, perms)?;
        }
        
        Ok(())
    }

    pub fn update(
        &self, 
        endpoint: Option<String>, 
        region: Option<String>, 
        ak: Option<String>, 
        sk: Option<String>
    ) -> Result<()> {
        let mut config = self.load()?;

        if let Some(v) = endpoint { config.endpoint = Some(v); }
        if let Some(v) = region { config.region = Some(v); }
        if let Some(v) = ak { config.ak_encrypted = Some(encrypt_string(&v)?); }
        if let Some(v) = sk { config.sk_encrypted = Some(encrypt_string(&v)?); }

        self.save(&config)?;
        println!("✅ 配置已保存至: {:?}", self.config_path);
        Ok(())
    }
}

// --- 加密/解密 辅助函数 ---

fn encrypt_string(plaintext: &str) -> Result<String> {
    let cipher = Aes256Gcm::new(SECRET_KEY.into());
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let nonce_obj = Nonce::from_slice(&nonce);

    let ciphertext = cipher.encrypt(nonce_obj, plaintext.as_bytes())
        .map_err(|_| anyhow::anyhow!("加密失败"))?;
    
    // 存储格式: base64(nonce + ciphertext)
    let mut combined = nonce.to_vec();
    combined.extend(ciphertext);
    
    Ok(general_purpose::STANDARD.encode(combined))
}

fn decrypt_string(encrypted_base64: &str) -> Result<String> {
    let encrypted_bytes = general_purpose::STANDARD.decode(encrypted_base64)
        .context("Base64 解码失败")?;
    
    if encrypted_bytes.len() < 12 {
        return Err(anyhow::anyhow!("数据损坏"));
    }

    let (nonce, ciphertext) = encrypted_bytes.split_at(12);
    let cipher = Aes256Gcm::new(SECRET_KEY.into());
    let nonce_obj = Nonce::from_slice(nonce);

    let plaintext = cipher.decrypt(nonce_obj, ciphertext)
        .map_err(|_| anyhow::anyhow!("解密失败 (可能是密钥不匹配或数据损坏)"))?;

    Ok(String::from_utf8(plaintext)?)
}
