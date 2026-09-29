# Endpointing Model Benchmark Report

**Model:** `/data/smart-turn-v3.2-cpu.onnx`

**Generated:** 2026-01-07 17:53:34 UTC

## Accuracy Results

**Total Samples:** 31,527

**Unique Languages:** 🇸🇦 Arabic, 🇧🇩 Bengali, 🇩🇰 Danish, 🇩🇪 German, 🇬🇧 🇺🇸 English, 🇫🇮 Finnish, 🇫🇷 French, 🇮🇳 Hindi, 🇮🇩 Indonesian, 🇮🇹 Italian, 🇯🇵 Japanese, 🇰🇷 Korean, 🇮🇳 Marathi, 🇳🇱 Dutch, 🇳🇴 Norwegian, 🇵🇱 Polish, 🇵🇹 Portuguese, 🇷🇺 Russian, 🇪🇸 Spanish, 🇹🇷 Turkish, 🇺🇦 Ukrainian, 🇻🇳 Vietnamese, 🇨🇳 Chinese

**Unique Datasets:** chirp3_1, chirp3_2, chirp3_3_short, human_5, human_convcollector_1, liva_1, midcentury_1, mundo_1, orpheus_endfiller_1, orpheus_grammar_1, orpheus_midfiller_1, rime_2

### Overall Performance

| Metric  | Sample Count | Accuracy (%) | Precision | Recall |    F1 | FPR (%) | FNR (%) |
| :------ | -----------: | -----------: | --------: | -----: | ----: | ------: | ------: |
| Overall |       31,527 |        92.63 |     0.909 |  0.947 | 0.927 |    4.73 |    2.64 |

### Performance by Language

| Language      | Sample Count | Accuracy (%) | Precision | Recall |    F1 | FPR (%) | FNR (%) |
| :------------ | -----------: | -----------: | --------: | -----: | ----: | ------: | ------: |
| 🇰🇷 Korean     |          889 |        96.96 |     0.956 |  0.984 | 0.970 |    2.25 |    0.79 |
| 🇹🇷 Turkish    |          966 |        96.79 |     0.955 |  0.981 | 0.968 |    2.28 |    0.93 |
| 🇩🇪 German     |        1,322 |        96.37 |     0.947 |  0.982 | 0.964 |    2.72 |    0.91 |
| 🇯🇵 Japanese   |          834 |        96.16 |     0.962 |  0.962 | 0.962 |    1.92 |    1.92 |
| 🇳🇱 Dutch      |        1,398 |        95.92 |     0.954 |  0.968 | 0.961 |    2.43 |    1.65 |
| 🇵🇱 Polish     |          974 |        95.38 |     0.948 |  0.955 | 0.952 |    2.46 |    2.16 |
| 🇮🇩 Indonesian |          971 |        95.16 |     0.939 |  0.964 | 0.951 |    3.09 |    1.75 |
| 🇮🇹 Italian    |          782 |        94.50 |     0.930 |  0.961 | 0.946 |    3.58 |    1.92 |
| 🇵🇹 Portuguese |        1,398 |        94.49 |     0.934 |  0.954 | 0.944 |    3.29 |    2.22 |
| 🇬🇧 🇺🇸 English |        7,820 |        94.26 |     0.926 |  0.959 | 0.942 |    3.75 |    1.99 |
| 🇺🇦 Ukrainian  |          929 |        94.19 |     0.924 |  0.954 | 0.939 |    3.66 |    2.15 |
| 🇫🇮 Finnish    |        1,010 |        94.16 |     0.930 |  0.954 | 0.942 |    3.56 |    2.28 |
| 🇫🇷 French     |        1,252 |        94.09 |     0.924 |  0.964 | 0.943 |    4.07 |    1.84 |
| 🇷🇺 Russian    |        1,468 |        93.53 |     0.920 |  0.960 | 0.940 |    4.36 |    2.11 |
| 🇩🇰 Danish     |          779 |        92.81 |     0.906 |  0.957 | 0.931 |    5.01 |    2.18 |
| 🇳🇴 Norwegian  |        1,014 |        91.81 |     0.896 |  0.950 | 0.922 |    5.62 |    2.56 |
| 🇮🇳 Hindi      |        1,284 |        90.11 |     0.856 |  0.975 | 0.911 |    8.57 |    1.32 |
| 🇸🇦 Arabic     |          947 |        89.76 |     0.872 |  0.936 | 0.903 |    6.97 |    3.27 |
| 🇪🇸 Spanish    |        1,783 |        89.57 |     0.867 |  0.929 | 0.897 |    6.95 |    3.48 |
| 🇨🇳 Chinese    |          929 |        85.79 |     0.894 |  0.818 | 0.854 |    4.95 |    9.26 |
| 🇧🇩 Bengali    |        1,000 |        83.80 |     0.800 |  0.892 | 0.844 |   10.90 |    5.30 |
| 🇮🇳 Marathi    |          774 |        82.43 |     0.762 |  0.952 | 0.846 |   15.12 |    2.45 |
| 🇻🇳 Vietnamese |        1,004 |        79.38 |     0.811 |  0.764 | 0.786 |    8.86 |   11.75 |

### Performance by Dataset

| Dataset               | Sample Count | Accuracy (%) | Precision | Recall |    F1 | FPR (%) | FNR (%) |
| :-------------------- | -----------: | -----------: | --------: | -----: | ----: | ------: | ------: |
| midcentury_1          |        1,044 |        98.47 |     0.978 |  0.990 | 0.984 |    1.05 |    0.48 |
| rime_2                |          394 |        96.95 |     0.970 |  0.958 | 0.964 |    1.27 |    1.78 |
| orpheus_endfiller_1   |          181 |        96.69 |     1.000 |  0.935 | 0.966 |    0.00 |    3.31 |
| human_5               |          402 |        96.02 |     0.945 |  0.966 | 0.956 |    2.49 |    1.49 |
| liva_1                |        3,831 |        93.97 |     0.924 |  0.960 | 0.941 |    3.99 |    2.04 |
| chirp3_1              |       16,254 |        93.78 |     0.923 |  0.955 | 0.939 |    3.97 |    2.25 |
| orpheus_grammar_1     |          163 |        91.41 |     0.890 |  0.953 | 0.920 |    6.13 |    2.45 |
| chirp3_3_short        |          104 |        91.35 |     0.933 |  0.875 | 0.903 |    2.88 |    5.77 |
| chirp3_2              |        8,428 |        89.31 |     0.870 |  0.923 | 0.896 |    6.85 |    3.84 |
| orpheus_midfiller_1   |          140 |        87.14 |     0.846 |  0.873 | 0.859 |    7.14 |    5.71 |
| human_convcollector_1 |           90 |        86.67 |     0.810 |  0.895 | 0.850 |    8.89 |    4.44 |
| mundo_1               |          496 |        84.27 |     0.796 |  0.919 | 0.853 |   11.69 |    4.03 |

