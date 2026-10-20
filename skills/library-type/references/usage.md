# 使用手册

脚本识别两种 RSeQC 证据行并分别取平均值：第一链证据大于 `0.75` 返回 `fr-firststrand`；否则第二链证据大于 `0.75` 返回 `fr-secondstrand`；其余返回 `fr-unstranded`。

```bash
python /workspace/.skills/library-type/scripts/detect_library_type.py --input /workspace/input/infer_experiment.txt --output /workspace/output/library-type --configured-type fr-firststrand
```

若结果为 `fr-unstranded`，请确认输入来自 RSeQC 的链特异性检查且证据比例足够高；不要仅凭该结果改变实验记录。
