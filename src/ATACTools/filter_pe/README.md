ATAC-seq Paired-End Filter (Rust Version)A high-performance, multi-threaded tool designed to strictly filter Paired-End ATAC-seq (or ChIP-seq) data.This tool is a Rust implementation of complex filtering logic that is difficult to achieve with standard samtools one-liners. It ensures that if one read of a pair fails quality checks (e.g., wrong orientation, chimeric alignment), both reads are discarded to maintain strict paired-end integrity.✨ Key Features🚀 Ultra-Fast: Written in Rust using rust-htslib. 5-10x faster than Pysam/Python scripts.🧵 Multi-threaded I/O: Utilizes parallel BGZF compression/decompression to maximize throughput.🧹 Strict Filtering:Removes Chimeric Reads (Pairs mapping to different chromosomes).Removes Improper Orientation (Reads that are not FR - Forward/Reverse).Removes Orphans/Singletons (If one read is discarded, its mate is also removed).📊 Detailed Statistics: Generates a JSON report (.filter_stats.json) for downstream QC (e.g., MultiQC).🗑️ Traceability: Optionally save discarded reads to a separate BAM file for debugging.👀 User Friendly: Features a real-time progress bar and colorful terminal output.🛠️ InstallationPrerequisitesRust (latest stable version): Install RustC Compiler (gcc/clang): Required for compiling htslib.Build from SourceBash# 1. Clone the repository (or go to your project dir)
cd scripts/filter_pe

# 2. Build the binary (Release mode is highly recommended for speed)
cargo build --release

# 3. The binary will be located at:
# ./target/release/filter_pe
🚀 UsageCommand Line ArgumentsBash./target/release/filter_pe --help
ArgumentFlagDescriptionInput-i, --inputInput BAM file. MUST be Name-Sorted (-n).Output-o, --outputOutput Clean BAM file (will be Name-Sorted).Discarded-d, --discarded(Optional) Output BAM file for discarded reads.Threads-t, --threadsNumber of threads for compression/decompression (Default: 4).⚠️ CRITICAL: The Sorting RuleThis tool uses a streaming algorithm that requires R1 and R2 to be adjacent. Therefore:Input: You MUST sort your input by name (samtools sort -n) before running this tool.Output: The output will be name-sorted. You MUST sort it back to coordinate order (samtools sort) for downstream tools like MACS2 or IGV.Example WorkflowBash# Step 1: Name Sort (Prepare for filtering)
samtools sort -n -@ 8 input.bam -o input.namesorted.bam

# Step 2: Run Filter (The Rust Tool)
./filter_pe \
    -i input.namesorted.bam \
    -o clean.namesorted.bam \
    -d discarded.namesorted.bam \
    -t 8

# Step 3: Coordinate Sort (Finalize for analysis)
samtools sort -@ 8 clean.namesorted.bam -o final.clean.bam
samtools index final.clean.bam
🧬 Filtering Logic ExplanationThe tool iterates through the BAM file pair by pair and applies the following logic:Chimeric Check:If Read1_Chromosome != Read2_Chromosome -> Discard Both.Orientation Check:Standard Illumina Paired-End library is FR (Forward-Reverse).If Read1_Strand == Read2_Strand (e.g., both Forward or both Reverse) -> Discard Both.Singleton Check:If a read is mapped but its mate is missing (or filtered out previously) -> Discard.📄 Output ExampleTerminal LogPlaintext    ██╗  ██╗ █████╗      ██╗██╗███╗   ███╗██╗
    ██║  ██║██╔══██╗     ██║██║████╗ ████║██║
    ███████║███████║     ██║██║██╔████╔██║██║
    ██╔══██║██╔══██║██   ██║██║██║╚██╔╝██║██║
    ██║  ██║██║  ██║╚█████╔╝██║██║ ╚═╝ ██║██║
    ╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝ ╚═╝╚═╝     ╚═╝╚═╝
          ATAC-seq Filter Tool v0.3.0

[INFO] Opening input bam: input.namesorted.bam (Threads: 8)
/ [00:00:15] Done! 20,000,000 reads processed (1,300,000/s)
[INFO] --------------------------------------------------
[INFO] Time Elapsed    : 15.42s
[INFO] Total Pairs     : 10,000,000
[INFO] Kept Pairs      : 9,500,000
[INFO] Discarded Pairs : 500,000
[INFO] Output BAM      : clean.bam
[INFO] Discarded BAM   : discarded.bam
[INFO] Stats JSON      : clean.filter_stats.json
[INFO] --------------------------------------------------
JSON Report (*.filter_stats.json)JSON{
  "sample_name": "clean",
  "total_pairs": 10000000,
  "kept_pairs": 9500000,
  "discarded_pairs": 500000,
  "fraction_kept": 0.95
}
📦 Integration with SnakemakePythonrule RustFilterPE:
    input:
        bam = "mapping/{sample}.sort.bam"
    output:
        bam = "filtered/{sample}.final.bam",
        json = "filtered/{sample}.filter_stats.json"
    conda:
        "envs/rust_env.yaml"
    threads: 8
    shell:
        """
        # 1. Name Sort
        samtools sort -n -@ {threads} -o {input.bam}.tmp {input.bam}
        
        # 2. Run Rust Tool
        scripts/filter_pe/target/release/filter_pe \
            -i {input.bam}.tmp \
            -o {output.bam}.tmp \
            -t {threads}
            
        # 3. Coordinate Sort & Index
        samtools sort -@ {threads} -o {output.bam} {output.bam}.tmp
        samtools index {output.bam}
        
        # Cleanup
        rm {input.bam}.tmp {output.bam}.tmp
        """
📝 LicenseThis project is licensed under the MIT License.