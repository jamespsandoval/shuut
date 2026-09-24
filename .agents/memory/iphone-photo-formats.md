---
name: iPhone photo formats
description: Why a compatible iOS photo picker representation does not guarantee JPEG upload bytes.
---

Do not assume an iOS picker request for a compatible representation has converted an HEIC/HEIF photo to JPEG. Check the selected file's bytes and, if it is still HEIC/HEIF, render and save a new JPEG before authorizing an upload. Keep the server's signature and size checks in place.

**Why:** iOS can preserve HEIC bytes despite a compatible-representation request; treating picker metadata as proof of JPEG results in a server rejection, including for valid portrait photos.

**How to apply:** Use this rule for any native post-photo attachment or future iPhone image upload flow; validate the converted file, not only the original selection.