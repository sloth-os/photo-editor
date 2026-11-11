# Local OCR language models

Tesseract tessdata_fast 4.1.0, Apache 2.0. These ten models ship with the PWA for offline recognition. Source files: https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0 . Each file is compressed with gzip (mtime 0) without changing trained data.

| Language code | Compressed SHA-256                                                 | Original traineddata SHA-256                                       |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| eng           | `f1c22599ed6fd3eb821d87fdb43e09f98b61179a4abe38c43cfca2cdcb9f5ec2` | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| chi_sim       | `89456b34c2769c9a6552b8c64e4186768f88aac37b698cfc073e5c5ea03293be` | `a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730` |
| chi_tra       | `e72fb843e602fe7a669d868a4f15288f4a7b110ad2a13926367c20a3877c71fa` | `529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b` |
| jpn           | `e63ef6c7bab048da264712946a674009b258f64b501d803bb70b95352763048f` | `1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d` |
| kor           | `117aa1421ffbc2cc32a5dce717f705b03ab78e6025a955cb4e291eb428e3ea7b` | `6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2` |
| spa           | `512d54fa722c1a0940bd20086d7ec487747e7f94771437d50405d6d8753dcc06` | `6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464` |
| fra           | `f4a6907e5a22350cd8df1313017333d5d544577c98090ac1da45c6e07da364a3` | `ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca` |
| deu           | `75ec5df828d692792091bb741bedf9c719f1a652d78e057a9d689422ac0a76be` | `19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d` |
| ara           | `e7fc02ba097c1afd9c07237a40765a54fbdf456eedf2ac9b17958df0f12364f9` | `e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729` |
| hin           | `027ee85a9656ec5488ad165111ff308706d9b67c571d73af4005d548f3953de6` | `4c73ffc59d497c186b19d1e90f5d721d678ea6b2e277b719bee4e2af12271825` |

Full license: ../../licenses/Tesseract-Apache-2.txt. Runtime/package versions are pinned by package-lock.json; runtime licenses are copied during preparation.
