`color-field.png` and `sensor.dng` are synthetic test data created for this project.
Regenerate the DNG with `python scripts/create-test-dng.py`.

`astronaut.png` is NASA's public-domain photograph of astronaut Eileen Collins,
distributed with scikit-image. Source:
https://github.com/scikit-image/scikit-image/blob/v0.19.3/skimage/data/astronaut.png
Its public-domain status is documented by `skimage.data.astronaut`:
https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut

`native-snapseed.txt` contains a publicly shared Snapseed preset payload, decoded
from https://github.com/rhys-fernandes/Django-Project/blob/master/media/1/shack_qr.jpeg
It is used to verify protobuf decoding and preservation of unsupported operators;
no photographic preview from that repository is included.
