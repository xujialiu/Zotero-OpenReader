"""Build the isolated EPUB for shared-position anchor verification (#234).

Run: python3 test/fixtures/anchor-integrity/make.py
"""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

HERE = Path(__file__).resolve().parent
REPLIES = " ".join(
    f"Entry {index} asks again. Yes. Answer {index} follows."
    for index in range(100)
)

FILES = {
    "mimetype": "application/epub+zip",
    "META-INF/container.xml": """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""",
    "OEBPS/content.opf": """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">zotero-openreader-anchor-integrity-234</dc:identifier>
<dc:title>Anchor position integrity fixture</dc:title><dc:language>en</dc:language>
<meta property="dcterms:modified">2026-11-05T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="chapter"/></spine>
</package>""",
    "OEBPS/nav.xhtml": """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol>
<li><a href="chapter.xhtml">Anchor position integrity fixture</a></li>
</ol></nav></body></html>""",
    "OEBPS/chapter.xhtml": f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Anchor positions</title></head>
<body>
<h1>Anchor position integrity fixture</h1>
<p id="fallback">This is the local fallback sentence. The next sentence is a control.</p>
<h2 id="long-heading">Chapter 70</h2>
<h2 id="right-heading">Chapter 7</h2>
<h2 id="other-heading">Chapter 71</h2>
<h2 id="partial-heading">Volume One Chapter 70</h2>
<p id="adjacent" xml:lang="zh">前文你好后文。 你好。</p>
<p id="replies">{REPLIES}</p>
<p id="ambiguous">Echo. Echo.</p>
<p id="normalization">A café opens here. A final control sentence follows.</p>
</body></html>""",
}

output = HERE / "anchor-integrity.epub"
with ZipFile(output, "w") as archive:
    for name, text in FILES.items():
        entry = ZipInfo(name, date_time=(2026, 11, 5, 0, 0, 0))
        entry.compress_type = ZIP_STORED if name == "mimetype" else ZIP_DEFLATED
        archive.writestr(entry, text.encode("utf-8"))
print(f"{output}: {output.stat().st_size} bytes")
