# Builds br-alt-text.epub and br-alt-text.html (issue #209): paragraphs whose
# Segment text Zotero spells with characters the page does not hold — a
# newline for an unspaced <br/>, an inline image's aria-label or prose alt —
# beside controls the plugin always highlighted. Run: python3 build.py
import base64
import os
import struct
import zlib
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

OUT = os.path.dirname(os.path.abspath(__file__))


def png(width, height):
    """A plain grey PNG, so the fixture carries no image of anyone else's."""
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)
    rows = b''.join(b'\x00' + b'\x99' * width for _ in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


IMAGE = png(24, 12)

# One paragraph per case, in reading order. {img} is the image's src.
PARAGRAPHS = [
    # 1. control: nothing between the words
    'The first paragraph has no break and no picture, and it was always highlighted.',
    # 2. the bug: an unspaced <br/>; no full stop between the lines, so the stanza is one Segment
    'Roses are red,<br/>Violets are blue,<br/>Sugar is sweet,<br/>And so are you.',
    # 3. control: a <br/> with a newline after it
    'Lilies are white,<br/>\nDaisies are bright.',
    # 4. the bug: an inline image with prose alt text, mid-sentence
    'The ratio <img src="{img}" alt="x over y"/> stays fixed while the soil is dry.',
    # 5. the bug: an inline image whose aria-label Zotero reads before its alt
    'Let <img src="{img}" aria-label="x sub i" alt="xi.png"/> be the mean of the sample.',
    # 6. control: a path-like alt, which Zotero does not read
    'A small figure <img src="{img}" alt="figure-1.png"/> sits in this sentence.',
    # 7. after the cases, so a skip lands on ordinary text again
    'The last paragraph is plain again, to show the reading carries on.',
]


def body(src):
    return '\n'.join('<p>%s</p>' % p.replace('{img}', src) for p in PARAGRAPHS)


XHTML = '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>Breaks and pictures</title></head>
<body>
<h1>Breaks and pictures</h1>
%s
</body>
</html>
''' % body('grey.png')

with ZipFile(os.path.join(OUT, 'br-alt-text.epub'), 'w') as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
    z.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
''', compress_type=ZIP_DEFLATED)
    z.writestr('OEBPS/content.opf', '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:br-alt-text-fixture-0001</dc:identifier>
<dc:title>Breaks and pictures</dc:title>
<dc:language>en</dc:language>
<dc:creator>Zotero-OpenReader test</dc:creator>
<meta property="dcterms:modified">2026-10-31T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="grey" href="grey.png" media-type="image/png"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>
''', compress_type=ZIP_DEFLATED)
    z.writestr('OEBPS/nav.xhtml', '''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="ch1.xhtml">Breaks and pictures</a></li></ol></nav></body>
</html>
''', compress_type=ZIP_DEFLATED)
    z.writestr('OEBPS/ch1.xhtml', XHTML, compress_type=ZIP_DEFLATED)
    z.writestr('OEBPS/grey.png', IMAGE, compress_type=ZIP_STORED)

# The snapshot: the same paragraphs, the image inline, no external file
DATA = 'data:image/png;base64,' + base64.b64encode(IMAGE).decode('ascii')
with open(os.path.join(OUT, 'br-alt-text.html'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('''<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Breaks and pictures</title></head>
<body>
<h1>Breaks and pictures</h1>
%s
</body>
</html>
''' % body(DATA))

print('wrote br-alt-text.epub and br-alt-text.html')
