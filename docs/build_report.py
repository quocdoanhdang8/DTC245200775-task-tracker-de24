#!/usr/bin/env python3
"""Build the editable Vietnamese course report as a formatted DOCX."""
from pathlib import Path
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "bao-cao-de24.md"
OUTPUT = ROOT / "bao-cao-de24.docx"
ARCHITECTURE = ROOT / "architecture.png"


def make_architecture():
    """Draw a report-ready architecture figure from the configured services."""
    scale = 2
    width, height = 1600, 1040
    image = Image.new("RGB", (width * scale, height * scale), "#f8faf8")
    draw = ImageDraw.Draw(image)
    font_root = Path("/usr/share/fonts/truetype/dejavu")
    win_fonts = Path("C:/Windows/Fonts")
    if (font_root / "DejaVuSans.ttf").exists():
        regular_path = str(font_root / "DejaVuSans.ttf")
        bold_path = str(font_root / "DejaVuSans-Bold.ttf")
    elif (win_fonts / "arial.ttf").exists():
        regular_path = str(win_fonts / "arial.ttf")
        bold_path = str(win_fonts / "arialbd.ttf")
    else:
        regular_path = "arial"
        bold_path = "arial"
    try:
        regular = ImageFont.truetype(regular_path, 20 * scale)
        small = ImageFont.truetype(regular_path, 16 * scale)
        title_font = ImageFont.truetype(bold_path, 29 * scale)
        node_title = ImageFont.truetype(bold_path, 19 * scale)
    except Exception:
        regular = small = title_font = node_title = ImageFont.load_default()

    def box(x, y, w, h, title, subtitle, fill, stroke="#d7e2da"):
        x, y, w, h = [v * scale for v in (x, y, w, h)]
        draw.rounded_rectangle((x, y, x + w, y + h), radius=18 * scale, fill=fill, outline=stroke, width=2 * scale)
        draw.text((x + 20 * scale, y + 16 * scale), title, font=node_title, fill="#173528")
        draw.text((x + 20 * scale, y + 49 * scale), subtitle, font=small, fill="#52675a")

    def arrow(start, end, label=None, color="#426b52", dashed=False):
        sx, sy = start[0] * scale, start[1] * scale
        ex, ey = end[0] * scale, end[1] * scale
        dx, dy = ex - sx, ey - sy
        length = max((dx * dx + dy * dy) ** 0.5, 1)
        ux, uy = dx / length, dy / length
        stop = 13 * scale
        ex2, ey2 = ex - ux * stop, ey - uy * stop
        if dashed:
            parts = 20
            for i in range(0, parts, 2):
                a, b = i / parts, min((i + 1) / parts, 1)
                draw.line((sx + dx * a, sy + dy * a, sx + dx * b, sy + dy * b), fill=color, width=3 * scale)
        else:
            draw.line((sx, sy, ex2, ey2), fill=color, width=3 * scale)
        angle = 0.48
        for sign in (-1, 1):
            cos_a = ux * __import__("math").cos(angle) - sign * uy * __import__("math").sin(angle)
            sin_a = uy * __import__("math").cos(angle) + sign * ux * __import__("math").sin(angle)
            draw.line((ex2, ey2, ex2 - cos_a * 15 * scale, ey2 - sin_a * 15 * scale), fill=color, width=3 * scale)
        if label:
            mx, my = (sx + ex) / 2, (sy + ey) / 2
            draw.text((mx - 32 * scale, my - 26 * scale), label, font=small, fill=color, stroke_width=3 * scale, stroke_fill="#f8faf8")

    draw.text((55 * scale, 30 * scale), "ĐỀ 24  |  KIẾN TRÚC TASK TRACKER", font=title_font, fill="#143b2a")
    # request and data path
    box(70, 125, 220, 92, "Trình duyệt", "HTTP qua loopback :8080", "#eef4ff", "#c8d8f2")
    box(365, 125, 245, 92, "Nginx", "Reverse proxy · headers", "#e7f5ed", "#c1dfce")
    box(690, 125, 270, 92, "Task Tracker", "Express · API · metrics", "#e7f5ed", "#c1dfce")
    box(1080, 125, 260, 92, "PostgreSQL", "Volume · role task_app", "#f1efff", "#d5cef2")
    box(1080, 270, 260, 82, "pgAdmin", "DB tool · loopback :5050", "#fff4e4", "#f0dfbd")
    arrow((290, 171), (365, 171), "HTTP")
    arrow((610, 171), (690, 171), "proxy")
    arrow((960, 171), (1080, 171), "SQL")
    arrow((1210, 270), (1210, 217), "SQL")

    # metrics flow
    draw.rounded_rectangle((55 * scale, 420 * scale, 1545 * scale, 665 * scale), radius=24 * scale, outline="#b5cbea", width=2 * scale)
    draw.text((78 * scale, 434 * scale), "OBSERVABILITY NETWORK  ·  METRICS", font=node_title, fill="#345c90")
    box(95, 490, 260, 100, "Prometheus", "Scrape interval 15s", "#edf4ff", "#c8d8f2")
    box(465, 490, 420, 100, "Exporters", "Postgres · Nginx · cAdvisor", "#edf4ff", "#c8d8f2")
    box(1030, 490, 310, 100, "Grafana", "Dashboard · Explore", "#edf4ff", "#c8d8f2")
    arrow((355, 540), (465, 540), "scrape")
    arrow((690, 217), (650, 490), "/metrics", "#4774ad", True)
    arrow((1175, 217), (780, 490), "pg exporter", "#4774ad", True)
    arrow((485, 217), (780, 490), "nginx exporter", "#4774ad", True)
    arrow((885, 540), (1030, 540), "PromQL")

    # logs flow
    draw.rounded_rectangle((55 * scale, 720 * scale, 1545 * scale, 985 * scale), radius=24 * scale, outline="#d8c6ea", width=2 * scale)
    draw.text((78 * scale, 733 * scale), "LOGGING NETWORK  ·  LOGQL", font=node_title, fill="#704f91")
    box(90, 800, 310, 100, "Log files", "App JSON · Nginx access/error", "#f8f0fc", "#dfcdee")
    box(505, 800, 260, 100, "Promtail", "Reads read-only volume", "#f8f0fc", "#dfcdee")
    box(875, 800, 250, 100, "Loki", "Log store", "#f8f0fc", "#dfcdee")
    box(1230, 800, 250, 100, "Grafana Explore", "LogQL queries", "#f8f0fc", "#dfcdee")
    arrow((400, 850), (505, 850), "files", "#8557a6")
    arrow((765, 850), (875, 850), "push", "#8557a6")
    arrow((1125, 850), (1230, 850), "query", "#8557a6")

    image.resize((width, height), Image.Resampling.LANCZOS).save(ARCHITECTURE)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=95, start=110, bottom=95, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for side, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{side}"))
        if node is None:
            node = OxmlElement(f"w:{side}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = qn(f"w:{edge}")
        element = borders.find(tag)
        if element is None:
            element = OxmlElement(f"w:{edge}")
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), "D9E1DC")


def set_run_font(run, name="Arial", size=10.5, color="1B2922", bold=None):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    if bold is not None:
        run.bold = bold


def add_inline(paragraph, text, *, code=False):
    # Supports **bold** and `inline code`, keeping the original Vietnamese text.
    pattern = re.compile(r"(\*\*.*?\*\*|`[^`]+`)")
    pos = 0
    for match in pattern.finditer(text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos:match.start()])
            set_run_font(run)
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, bold=True)
        else:
            run = paragraph.add_run(token[1:-1])
            set_run_font(run, name="Consolas", size=9.5, color="385A47")
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_run_font(run, name="Consolas" if code else "Arial", size=9.2 if code else 10.5)


def add_page_field(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "2"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend((begin, instruction, separate, text, end))
    set_run_font(run, size=9, color="76827A")


def parse_table(lines, doc):
    rows = []
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [part.strip() for part in line.strip().strip("|").split("|")]
        if cells and all(re.fullmatch(r"[-: ]+", cell or "-") for cell in cells):
            continue
        rows.append(cells)
    if not rows:
        return
    columns = max(len(row) for row in rows)
    table = doc.add_table(rows=0, cols=columns)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    table.style = "Table Grid"
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for col_index in range(columns):
            value = values[col_index] if col_index < len(values) else ""
            cell = cells[col_index]
            cell.text = ""
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(1)
            paragraph.paragraph_format.line_spacing = 1.08
            add_inline(paragraph, value)
            for run in paragraph.runs:
                set_run_font(run, size=9.1, color="FFFFFF" if row_index == 0 else "26352D", bold=(row_index == 0))
            set_cell_shading(cell, "174F3A" if row_index == 0 else ("F0F5F1" if row_index % 2 == 0 else "FFFFFF"))
    table.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
    set_table_borders(table)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(2)


def configure_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor(27, 41, 34)
    normal.paragraph_format.line_spacing = 1.2
    normal.paragraph_format.space_after = Pt(6)
    for name, size in (("Title", 22), ("Heading 1", 15), ("Heading 2", 12.5), ("Heading 3", 11)):
        style = doc.styles[name]
        style.font.name = "Arial"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(10 if name != "Title" else 0)
        style.paragraph_format.space_after = Pt(6)
    title_ppr = doc.styles["Title"]._element.pPr
    if title_ppr is not None:
        title_borders = title_ppr.find(qn("w:pBdr"))
        if title_borders is not None:
            title_ppr.remove(title_borders)


def main():
    make_architecture()
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(0.72)
    section.bottom_margin = Inches(0.72)
    section.left_margin = Inches(0.82)
    section.right_margin = Inches(0.82)
    section.different_first_page_header_footer = True
    configure_styles(doc)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = header.add_run("TRIỂN KHAI VÀ QUẢN TRỊ HỆ THỐNG PHẦN MỀM  ·  ĐỀ 24")
    set_run_font(run, size=8.2, color="76827A")
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_page_field(footer)

    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    in_code = False
    code_lines = []
    in_title_page = True
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            if not in_code:
                in_code, code_lines = True, []
            else:
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Inches(0.18)
                p.paragraph_format.right_indent = Inches(0.12)
                p.paragraph_format.space_before = Pt(3)
                p.paragraph_format.space_after = Pt(7)
                p.paragraph_format.line_spacing = 1.02
                for n, code_line in enumerate(code_lines):
                    if n:
                        p.add_run().add_break()
                    run = p.add_run(code_line or " ")
                    set_run_font(run, name="Consolas", size=8.1, color="31453A")
                in_code = False
            i += 1
            continue
        if in_code:
            code_lines.append(line)
            i += 1
            continue
        if line.strip() == "<!-- PAGEBREAK -->":
            doc.add_page_break()
            in_title_page = False
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        if line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            parse_table(table_lines, doc)
            continue
        if line.startswith("# "):
            text = line[2:].strip()
            if in_title_page:
                p = doc.add_paragraph(style="Title")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(34)
                p.paragraph_format.space_after = Pt(17)
                ppr = p._p.get_or_add_pPr()
                direct_borders = ppr.find(qn("w:pBdr"))
                if direct_borders is not None:
                    ppr.remove(direct_borders)
                add_inline(p, text)
            else:
                p = doc.add_paragraph(style="Heading 1")
                add_inline(p, text)
            i += 1
            continue
        if line.startswith("## "):
            text = line[3:].strip()
            if in_title_page:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_after = Pt(14)
                add_inline(p, text)
                for run in p.runs:
                    set_run_font(run, size=16, color="174F3A", bold=True)
            else:
                p = doc.add_paragraph(style="Heading 2")
                add_inline(p, text)
            i += 1
            continue
        if line.startswith("### "):
            p = doc.add_paragraph(style="Heading 3")
            add_inline(p, line[4:].strip())
            i += 1
            continue
        img_match = re.match(r"^!\[(.*?)\]\((.*?)\)", line)
        if img_match:
            img_rel = img_match.group(2)
            img_path = ROOT / img_rel
            if img_path.exists():
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(2)
                p.add_run().add_picture(str(img_path), width=Inches(6.2))
            i += 1
            continue
        if line.startswith("*Hình ") and line.endswith("*"):
            caption = doc.add_paragraph(line.strip("*"))
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
            caption.paragraph_format.space_before = Pt(1)
            caption.paragraph_format.space_after = Pt(6)
            for run in caption.runs:
                set_run_font(run, size=9.2, color="52675A")
                run.italic = True
            i += 1
            continue
        if line.startswith("**[CHÈN HÌNH"):
            if "pgadmin" in line.lower() and (ROOT / "screenshots" / "pgadmin-tasks.png").exists():
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(2)
                p.add_run().add_picture(str(ROOT / "screenshots" / "pgadmin-tasks.png"), width=Inches(6.2))
                caption = doc.add_paragraph("Hình 4.2. pgAdmin kết nối server và hiển thị dữ liệu bảng tasks")
                caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in caption.runs:
                    set_run_font(run, size=9.2, color="52675A")
                    run.italic = True
            else:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                add_inline(p, line)
                for run in p.runs:
                    set_run_font(run, size=9.5, color="8A5A1B", bold=True)
            i += 1
            continue
        if line.startswith("- "):
            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.space_after = Pt(3)
            add_inline(p, line[2:].strip())
            i += 1
            continue
        if re.match(r"^\d+[.)] ", line):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            p.paragraph_format.first_line_indent = Inches(-0.3)
            p.paragraph_format.space_after = Pt(3)
            marker = re.match(r"^(\d+[.)]) ", line).group(1)
            item_text = re.sub(r"^\d+[.)] ", "", line)
            # The invisible leading character keeps Word/LibreOffice from
            # consuming the first literal number as automatic list formatting.
            add_inline(p, f"\u200b{marker} {item_text}")
            i += 1
            continue
        if line.startswith("> "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.18)
            add_inline(p, line[2:])
            for run in p.runs:
                run.italic = True
                run.font.color.rgb = RGBColor(81, 99, 87)
            i += 1
            continue
        # Keep consecutive lines in the same Markdown paragraph together.
        text_parts = [line.strip()]
        i += 1
        while (i < len(lines) and lines[i].strip()
               and not lines[i].startswith(("# ", "## ", "### ", "- ", "> ", "|", "```", "![", "*Hình ", "**[CHÈN HÌNH"))
               and lines[i].strip() != "<!-- PAGEBREAK -->"
               and not re.match(r"^\d+[.)] ", lines[i])):
            text_parts.append(lines[i].strip())
            i += 1
        text = " ".join(text_parts).replace("  ", " ")
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        if text.startswith("Prometheus sử dụng chu kỳ scrape"):
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        if in_title_page:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_after = Pt(8)
        add_inline(p, text)

    doc.core_properties.title = "Báo cáo thực hành Đề 24 — Task Tracker"
    doc.core_properties.subject = "Triển khai và Quản trị Hệ thống Phần mềm"
    doc.core_properties.author = "[HỌ VÀ TÊN]"
    doc.save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
