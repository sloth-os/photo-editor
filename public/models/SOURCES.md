# Bundled local models

These fixed assets ship with the PWA and are precached for offline use. The
preparation script verifies their SHA-256 checksums before development/build.
Inference runs in a local worker; image data is not sent to the model providers.

| Asset                          | Source/version                                                                                                                                                  | License                  | SHA-256                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `deeplab_v3.tflite`            | [MediaPipe DeepLab V3, float32, version 1](https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite)              | Apache 2.0               | `ff36e24d40547fe9e645e2f4e8745d1876d6e38b332d39a82f0bf0f5d1d561b3` |
| `face_landmarker.task`         | [MediaPipe Face Landmarker, float16, version 1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) | Apache 2.0               | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `depth-anything-v2-small.onnx` | [Depth Anything V2 Small, quantized ONNX conversion](https://huggingface.co/onnx-community/depth-anything-v2-small/blob/main/onnx/model_quantized.onnx)         | Apache 2.0 (Small model) | `fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d` |

MediaPipe model/runtime source: https://github.com/google-ai-edge/mediapipe

Depth Anything V2 authors: Lihe Yang, Bingyi Kang, Zilong Huang, Xiaogang Xu,
Jiashi Feng, and Hengshuang Zhao. Source:
https://github.com/DepthAnything/Depth-Anything-V2

Only the Apache-licensed **Small** model is bundled. This does not include the
noncommercial larger checkpoints. ONNX conversion is distributed by the
onnx-community project. Runtime dependency versions are fixed in the npm lockfile.

License texts are in `public/licenses/MediaPipe-Apache-2.txt` and
`public/licenses/Depth-Anything-V2-Small-Apache-2.txt`. MediaPipe, ONNX Runtime,
piexifjs, and other package license texts are copied to
`public/licenses/generated/` from the installed packages during preparation.
