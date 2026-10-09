from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "2026年智慧城管全局态势分析报告.pdf"
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
pdfmetrics.registerFont(TTFont("YaHei", FONT))
pdfmetrics.registerFont(TTFont("YaHeiBold", FONT_BOLD if Path(FONT_BOLD).exists() else FONT))

PAGE = landscape(A4)
W, H = PAGE
NAVY = colors.HexColor("#061523")
PANEL = colors.HexColor("#0B2233")
CYAN = colors.HexColor("#45DDF5")
GREEN = colors.HexColor("#46E09B")
YELLOW = colors.HexColor("#FFC257")
MUTED = colors.HexColor("#87A9BA")
WHITE = colors.HexColor("#F0FAFF")


def paragraph(text, size=9, color=WHITE, leading=14, bold=False):
    return Paragraph(text, ParagraphStyle(
        "body", fontName="YaHeiBold" if bold else "YaHei", fontSize=size,
        leading=leading, textColor=color, alignment=TA_LEFT,
    ))


def header(c, page_no):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setStrokeColor(colors.HexColor("#17455D"))
    c.line(16 * mm, H - 18 * mm, W - 16 * mm, H - 18 * mm)
    c.setFont("YaHeiBold", 18)
    c.setFillColor(CYAN)
    c.drawString(16 * mm, H - 13 * mm, "2026年北斗智慧巡检试点验证态势报告")
    c.setFont("YaHei", 8)
    c.setFillColor(MUTED)
    c.drawRightString(W - 16 * mm, H - 12 * mm, f"数智清道夫 | 2026-10-11 | 第 {page_no} 页")


def card(c, x, y, width, height, label, value, unit="", color=CYAN):
    c.setFillColor(PANEL)
    c.setStrokeColor(colors.HexColor("#1C526B"))
    c.roundRect(x, y, width, height, 3 * mm, fill=1, stroke=1)
    c.setFont("YaHei", 8)
    c.setFillColor(MUTED)
    c.drawString(x + 6 * mm, y + height - 8 * mm, label)
    c.setFont("YaHeiBold", 21)
    c.setFillColor(color)
    c.drawString(x + 6 * mm, y + 7 * mm, value)
    if unit:
        c.setFont("YaHei", 8)
        c.setFillColor(MUTED)
        c.drawString(x + width - 18 * mm, y + 9 * mm, unit)


def section(c, x, y, width, height, title, body):
    c.setFillColor(colors.HexColor("#081C2B"))
    c.setStrokeColor(colors.HexColor("#17465D"))
    c.roundRect(x, y, width, height, 2.5 * mm, fill=1, stroke=1)
    c.setFont("YaHeiBold", 11)
    c.setFillColor(CYAN)
    c.drawString(x + 6 * mm, y + height - 9 * mm, title)
    p = paragraph(body, 8.4, WHITE, 14)
    _, paragraph_height = p.wrap(width - 12 * mm, height - 20 * mm)
    p.drawOn(c, x + 6 * mm, y + height - 17 * mm - paragraph_height)


def page_one(c):
    header(c, 1)
    margin = 16 * mm
    gap = 5 * mm
    top = H - 25 * mm
    card_w = (W - 2 * margin - 3 * gap) / 4
    for i, item in enumerate([
        ("累计测试里程", "1,286", "km", CYAN),
        ("事件闭环率", "92.9%", "", GREEN),
        ("平均响应耗时", "8.6", "min", YELLOW),
        ("活跃测试终端", "6", "台", CYAN),
    ]):
        card(c, margin + i * (card_w + gap), top - 32 * mm, card_w, 27 * mm, *item)

    summary = (
        "<b>统计口径</b><br/>截至2026年10月11日，数据来自校内测试及小范围企业合作验证，"
        "不代表城市级正式运营规模。<br/><br/>"
        "<b>总体态势</b><br/>累计记录异常事件368件，完成闭环342件；接入测试终端9台，"
        "其中6台保持活跃。系统已验证感知、定位、决策、调度和反馈的完整链路。<br/><br/>"
        "<b>AI调度验证</b><br/>198件事件进入自动闭环流程，其余事件经人工确认后完成处置。"
        "内部对比样本中，平均响应时间由18.4分钟缩短至8.6分钟，下降约53.3%。"
    )
    section(c, margin, 22 * mm, 118 * mm, 112 * mm, "试点验证综述", summary)

    x = margin + 123 * mm
    y = 22 * mm
    width = W - x - margin
    height = 112 * mm
    c.setFillColor(colors.HexColor("#081C2B")); c.setStrokeColor(colors.HexColor("#17465D"))
    c.roundRect(x, y, width, height, 2.5 * mm, fill=1, stroke=1)
    c.setFont("YaHeiBold", 11); c.setFillColor(CYAN)
    c.drawString(x + 6 * mm, y + height - 9 * mm, "事件类型分布")
    data = [("塑料", 104, CYAN), ("纸板", 82, GREEN), ("纸张", 64, YELLOW),
            ("金属", 56, colors.HexColor("#E888F5")), ("玻璃", 36, colors.HexColor("#6EA8FF")),
            ("可降解垃圾", 26, colors.HexColor("#FF7B93"))]
    max_value = 104
    for i, (name, value, color) in enumerate(data):
        by = y + height - 22 * mm - i * 14 * mm
        c.setFont("YaHei", 8); c.setFillColor(WHITE); c.drawString(x + 7 * mm, by + 2 * mm, name)
        c.setFillColor(colors.HexColor("#102E40")); c.roundRect(x + 32 * mm, by, width - 53 * mm, 5 * mm, 2 * mm, fill=1, stroke=0)
        c.setFillColor(color); c.roundRect(x + 32 * mm, by, (width - 53 * mm) * value / max_value, 5 * mm, 2 * mm, fill=1, stroke=0)
        c.setFont("YaHeiBold", 8); c.drawRightString(x + width - 7 * mm, by + 1.3 * mm, f"{value}件")
    c.setFont("YaHei", 7); c.setFillColor(MUTED)
    c.drawString(x + 7 * mm, y + 7 * mm, "塑料、纸板和纸张合计约占68%，是当前试点的主要事件类型。")


def page_two(c):
    header(c, 2)
    margin = 16 * mm
    left = (
        "<b>10月11日朝阳区作业环境</b><br/>天气：多云转阴；气温：16-25℃；"
        "地表温度：23℃；相对湿度：58%；风力：2级；PM2.5：35 μg/m³；"
        "路面摩擦系数：0.68；降水影响：无。<br/><br/>"
        "气温与天气依据2026年10月9日上午公开预报设置；湿度、PM2.5、地表温度和"
        "摩擦系数为赛事展示用微气候参数，不作为实时监测结论。"
    )
    section(c, margin, 90 * mm, 126 * mm, 79 * mm, "微气候气象孪生", left)
    right = (
        "<b>重点结论</b><br/>朝阳区试点事件184件，完成闭环175件，3台终端活跃。"
        "其余区域为小样本联合验证数据，用于展示跨区域数据汇总能力。<br/><br/>"
        "<b>后续建议</b><br/>扩大测试点位，持续提升复杂光照、小目标和多目标条件下的识别稳定性；"
        "优化短时断网重连与任务补发；保留人工确认机制，并继续积累可追溯验证样本。"
    )
    section(c, margin + 132 * mm, 90 * mm, W - 2 * margin - 132 * mm, 79 * mm, "区域态势与建议", right)

    rows = [
        ["区域", "发现事件", "完成闭环", "活跃终端"],
        ["朝阳区", "184", "175", "3"], ["海淀区", "45", "41", "1"],
        ["丰台区", "32", "29", "1"], ["通州区", "25", "23", "1"],
        ["其他12区", "82", "74", "0"], ["合计", "368", "342", "6"],
    ]
    table = Table(rows, colWidths=[60 * mm, 35 * mm, 35 * mm, 35 * mm], rowHeights=9 * mm)
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "YaHei"), ("FONTNAME", (0, 0), (-1, 0), "YaHeiBold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8), ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12394D")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#081C2B")),
        ("GRID", (0, 0), (-1, -1), .5, colors.HexColor("#20516A")),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    table.wrapOn(c, W, H)
    table.drawOn(c, margin, 24 * mm)
    c.setFont("YaHei", 7); c.setFillColor(MUTED)
    c.drawRightString(W - margin, 17 * mm, "说明：本报告为iCAN赛事展示与试点验证材料。")


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=PAGE, pageCompression=1)
    c.setTitle("2026年北斗智慧巡检试点验证态势报告")
    c.setAuthor("数智清道夫项目组")
    page_one(c); c.showPage(); page_two(c); c.showPage(); c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
