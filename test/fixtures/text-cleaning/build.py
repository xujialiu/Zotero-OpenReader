"""Build the offline EPUB for Text cleaning checks (issue #240)."""
from html import escape
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_STORED, ZIP_DEFLATED

paragraphs = [
    '这 是 一句 话。',
    '中文 ， 测试。',
    '中 [文]。',
    'BNN 结构与第 3 章保持不变。',
    '中 文。',
    '测 试 缓 存。',
]
chapter = '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN"><head><title>Text cleaning fixture</title></head>
<body>''' + ''.join('<p>' + escape(p) + '</p>' for p in paragraphs) + '</body></html>'
files = {
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': '''<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
<rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>''',
    'content.opf': '''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">ztts-issue-240</dc:identifier>
<dc:title>Text cleaning fixture</dc:title><dc:language>zh-CN</dc:language>
<meta property="dcterms:modified">2026-11-06T00:00:00Z</meta></metadata>
<manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>
<spine><itemref idref="chapter"/></spine></package>''',
    'chapter.xhtml': chapter,
    'nav.xhtml': '''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol><li>
<a href="chapter.xhtml">Text cleaning fixture</a></li></ol></nav></body></html>''',
}
with ZipFile(Path(__file__).with_name('text-cleaning.epub'), 'w') as archive:
    for name, contents in files.items():
        entry = ZipInfo(name, (2026, 11, 6, 0, 0, 0))
        entry.compress_type = ZIP_STORED if name == 'mimetype' else ZIP_DEFLATED
        archive.writestr(entry, contents.encode('utf-8'))
