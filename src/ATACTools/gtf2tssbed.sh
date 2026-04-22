awk -F'\t' 'BEGIN{OFS="\t"} $3=="transcript" {
  split($9, a, "transcript_id \"");
  split(a[2], b, "\"");
  tid = b[1] ? b[1] : "NA";
  if($7=="+") 
    print $1, $4-1, $4, tid, 0, $7;
  else 
    print $1, $5-1, $5, tid, 0, $7;
}' Lsat_Salinas_v11.genome.gtf | sort -k1,1 -k2,2n | cut -f 1,2,3,4 > Lsat_Salinas_v11.xw.tss.bed
# tss enrichment analysis 
# 一个示例的从 GTF 转换完成的 TSS 文件
# chr1	11120	11121	ENST00000832824.1
# chr1	11124	11125	ENST00000832825.1
# chr1	11409	11410	ENST00000832826.1
# chr1	11410	11411	ENST00000832827.1
# chr1	11425	11426	ENST00000832828.1
# chr1	11769	11770	ENST00000832829.1
# chr1	11818	11819	ENST00000832830.1
# chr1	11822	11823	ENST00000832837.1
# chr1	11823	11824	ENST00000832836.1
# chr1	11823	11824	ENST00000832832.1

awk -F'\t' 'BEGIN{OFS="\t"} $3=="gene" {
  split($9, a, "gene_id \"");
  split(a[2], b, "\"");
  tid = b[1] ? b[1] : "NA";
  if($7=="+") 
    print $1, $4-1, $4, tid, 0, $7;
  else 
    print $1, $5-1, $5, tid, 0, $7;
}' gencode.vM38.annotation.gtf | sort -k1,1 -k2,2n | cut -f 1,2,3,4 > gencode.vM38.annotation.tss.bed