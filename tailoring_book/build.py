"""テーラリング教本のPDFを組版する。

    python3 build.py

src/*.html をファイル名順に連結し、図版（{{SVG:名前}}）と目次（{{TOC}}）を差し込んで
WeasyPrint で PDF を出力する。目次は各見出しへのハイパーリンクとページ番号付きで自動生成され、
PDFのしおり（アウトライン）も見出しから作られる。採寸フォームのページは単独のPDFにも書き出す。
"""

import glob
import html
import os
import re

import weasyprint
from pypdf import PdfReader, PdfWriter

import diagrams

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tailoring_book.pdf")
FORM_OUT = os.path.join(HERE, "measurement_forms.pdf")


def strip_tags(s):
    s = re.sub(r'<span class="cnum">(.*?)</span>', r"\1　", s)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def build_toc(body):
    items = []
    for m in re.finditer(r'<(h1|h2)\s+id="([^"]+)"([^>]*)>(.*?)</\1>', body, re.S):
        tag, hid, attrs, inner = m.groups()
        if "notoc" in attrs:
            continue
        if tag == "h1":
            cls = "part" if "ptitle" in attrs else "ch"
        else:
            cls = "sec"
        items.append(f'<li class="{cls}"><a href="#{hid}">{html.escape(strip_tags(inner))}</a></li>')
    return "<ul>" + "\n".join(items) + "</ul>"


def main():
    parts = []
    for path in sorted(glob.glob(os.path.join(HERE, "src", "*.html"))):
        with open(path, encoding="utf-8") as f:
            parts.append(f.read())
    body = "\n".join(parts)

    for name, fn in diagrams.ALL.items():
        body = body.replace("{{SVG:%s}}" % name, fn())
    # 各章の見出しの前に「目次へ」リンクを入れる
    body = re.sub(r'(<section class="chapter">\s*)(<h1 )',
                  r'\1<a class="back-to-toc" href="#toc">▲ 目次へ</a>\2', body)
    body = body.replace("{{TOC}}", build_toc(body))
    leftover = re.findall(r"\{\{[^}]+\}\}", body)
    assert not leftover, leftover

    doc = (
        '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
        "<title>テーラーを目指す人のための スーツ仕立て教本</title>"
        '<meta name="author" content="Tailoring Workbook">'
        '<meta name="description" content="ジャケットとトラウザーズの採寸・製図・裁断・縫製">'
        '<link rel="stylesheet" href="style.css"></head><body>'
        + body
        + "</body></html>"
    )
    with open(os.path.join(HERE, "book.html"), "w", encoding="utf-8") as f:
        f.write(doc)

    rendered = weasyprint.HTML(string=doc, base_url=HERE).render()
    n = len(rendered.pages)
    print("pages:", n)
    rendered.write_pdf(OUT)

    # 採寸フォームだけを抜き出した PDF（コピー・印刷用）
    reader = PdfReader(OUT)
    writer = PdfWriter()
    for page in reader.pages:
        text = page.extract_text() or ""
        if "FORM-" in text:
            writer.add_page(page)
    with open(FORM_OUT, "wb") as f:
        writer.write(f)
    print("form pages:", len(writer.pages))


if __name__ == "__main__":
    main()
