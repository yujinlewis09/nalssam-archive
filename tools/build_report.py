# -*- coding: utf-8 -*-
"""
날샘(NALSSAM) 연구·활동 보고서 양식 생성기
  python tools/build_report.py            -> report/downloads/nalssam-report.docx
  (PDF/HWP/HWPX 는 tools/convert_report.ps1 이 Word·한글로 변환)

구성: Overleaf의 실험 보고서(Lab report) · 연구 논문(Research paper) · 기술 보고서(Technical report)
양식을 섞고, 동아리 활동에 필요한 '활동 관리 기록(일정·역할·의사결정·예산)'을 더했습니다.
"""
import os
import sys
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Mm, RGBColor, Cm

FOREST = RGBColor(0x1F, 0x6B, 0x2C)
LEAF = RGBColor(0x5F, 0xB2, 0x36)
INK = RGBColor(0x12, 0x33, 0x1A)
MUTE = RGBColor(0x7C, 0x93, 0x7E)
FONT = '맑은 고딕'

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'report', 'downloads')


# ---------------------------------------------------------------- helpers
def set_font(run, size=None, bold=None, color=None, italic=None, font=FONT):
    run.font.name = font
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rfonts.set(qn(attr), font)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if color is not None:
        run.font.color.rgb = color
    return run


def shade(el_pr, fill):
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill)
    el_pr.append(shd)


def para_border(p, side='bottom', color='1F6B2C', sz=12, space=4):
    ppr = p._p.get_or_add_pPr()
    bdr = ppr.find(qn('w:pBdr'))
    if bdr is None:
        bdr = OxmlElement('w:pBdr')
        ppr.append(bdr)
    el = OxmlElement(f'w:{side}')
    el.set(qn('w:val'), 'single')
    el.set(qn('w:sz'), str(sz))
    el.set(qn('w:space'), str(space))
    el.set(qn('w:color'), color)
    bdr.append(el)


def para(doc, text='', size=10.5, bold=False, color=INK, align=None, before=0, after=4, italic=False, keep_next=False, style=None):
    p = doc.add_paragraph(style=style) if style else doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = 1.45
    if keep_next:
        pf.keep_with_next = True
    if align:
        p.alignment = align
    if text:
        set_font(p.add_run(text), size=size, bold=bold, color=color, italic=italic)
    return p


def guide(doc, text, before=0, after=6):
    """회색 기울임 작성 안내 (제출 전 지우기)"""
    p = para(doc, before=before, after=after)
    set_font(p.add_run('작성 안내  '), size=9, bold=True, color=LEAF)
    set_font(p.add_run(text), size=9, italic=True, color=MUTE)
    return p


def placeholder(doc, text, after=6):
    p = para(doc, after=after)
    set_font(p.add_run(text), size=10.5, color=RGBColor(0x9A, 0xAE, 0x9C))
    return p


def heading(doc, text, level=1):
    style = {1: 'Heading 1', 2: 'Heading 2', 3: 'Heading 3'}[level]
    p = doc.add_paragraph(style=style)
    run = p.add_run(text)
    if level == 1:
        set_font(run, size=15, bold=True, color=INK)
        p.paragraph_format.space_before = Pt(20)
        p.paragraph_format.space_after = Pt(8)
        para_border(p, 'bottom', 'CDEB9B', 10, 4)
    elif level == 2:
        set_font(run, size=12, bold=True, color=FOREST)
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
    else:
        set_font(run, size=10.5, bold=True, color=INK)
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    return p


def table(doc, headers, rows, widths_mm, header_fill='E3F3C8', font_size=9.5, first_col_fill=None):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    tbl_pr = t._tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'single')
        b.set(qn('w:sz'), '6')
        b.set(qn('w:space'), '0')
        b.set(qn('w:color'), 'B9D9A8')
        borders.append(b)
    tbl_pr.append(borders)
    for r_i, row in enumerate([headers] + rows):
        for c_i, val in enumerate(row):
            cell = t.cell(r_i, c_i)
            cell.width = Mm(widths_mm[c_i])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            tc_pr = cell._tc.get_or_add_tcPr()
            if r_i == 0 and header_fill:
                shade(tc_pr, header_fill)
            elif first_col_fill and c_i == 0:
                shade(tc_pr, first_col_fill)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.25
            is_ph = isinstance(val, str) and val.startswith('[') and r_i > 0
            set_font(p.add_run(val), size=font_size, bold=(r_i == 0 or (first_col_fill and c_i == 0)),
                     color=FOREST if r_i == 0 else (RGBColor(0x9A, 0xAE, 0x9C) if is_ph else INK))
    for c_i, w in enumerate(widths_mm):
        for cell in t.columns[c_i].cells:
            cell.width = Mm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def caption(doc, text):
    p = para(doc, after=8, align=WD_ALIGN_PARAGRAPH.CENTER)
    set_font(p.add_run(text), size=9, color=MUTE)
    return p


def boxed(doc, title, lines, fill='F6FBEF'):
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.cell(0, 0)
    cell.width = Mm(160)
    tc_pr = cell._tc.get_or_add_tcPr()
    shade(tc_pr, fill)
    borders = OxmlElement('w:tcBorders')
    for side in ('top', 'left', 'bottom', 'right'):
        b = OxmlElement(f'w:{side}')
        b.set(qn('w:val'), 'single')
        b.set(qn('w:sz'), '10')
        b.set(qn('w:color'), '1F6B2C')
        borders.append(b)
    tc_pr.append(borders)
    p = cell.paragraphs[0]
    set_font(p.add_run(title), size=10, bold=True, color=FOREST)
    for ln in lines:
        q = cell.add_paragraph()
        q.paragraph_format.line_spacing = 1.45
        q.paragraph_format.space_after = Pt(2)
        set_font(q.add_run(ln), size=10, color=RGBColor(0x9A, 0xAE, 0x9C) if ln.startswith('[') else INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def field(paragraph, instr, placeholder_text=''):
    r = paragraph.add_run()
    b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'begin')
    i = OxmlElement('w:instrText'); i.set(qn('xml:space'), 'preserve'); i.text = instr
    s = OxmlElement('w:fldChar'); s.set(qn('w:fldCharType'), 'separate')
    r._r.append(b); r._r.append(i); r._r.append(s)
    t = paragraph.add_run(placeholder_text)
    e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), 'end')
    t._r.append(e)
    return r


def bullet(doc, text, level=0):
    p = para(doc, after=2)
    p.paragraph_format.left_indent = Mm(5 + level * 5)
    p.paragraph_format.first_line_indent = Mm(-3.5)
    set_font(p.add_run('•  ' if level == 0 else '–  '), size=10.5, color=LEAF)
    is_ph = text.startswith('[')
    set_font(p.add_run(text), size=10.5, color=RGBColor(0x9A, 0xAE, 0x9C) if is_ph else INK)
    return p


def page_break(doc):
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ---------------------------------------------------------------- document
def build(path):
    doc = Document()

    # 기본 스타일
    normal = doc.styles['Normal']
    normal.font.name = FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)
    for lvl in (1, 2, 3):
        st = doc.styles[f'Heading {lvl}']
        st.font.name = FONT
        st.font.color.rgb = INK
        rpr = st.element.get_or_add_rPr()
        rf = rpr.find(qn('w:rFonts'))
        if rf is None:
            rf = OxmlElement('w:rFonts'); rpr.append(rf)
        for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia'):
            rf.set(qn(attr), FONT)

    # 목차 줄 간격 (Word가 목차를 만들 때 이 스타일을 사용)
    from docx.enum.style import WD_STYLE_TYPE
    for name, indent in (('toc 1', 0), ('toc 2', 6)):
        try:
            st = doc.styles[name]
        except KeyError:
            st = doc.styles.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        st.element.set(qn('w:styleId'), name.replace(' ', '').upper())   # Word 기본 목차 스타일 ID(TOC1, TOC2)와 일치
        st.base_style = doc.styles['Normal']
        st.font.name = FONT
        st.font.size = Pt(10.5 if indent == 0 else 10)
        st.font.bold = indent == 0
        st.paragraph_format.space_before = Pt(5 if indent == 0 else 0)
        st.paragraph_format.space_after = Pt(1)
        st.paragraph_format.line_spacing = 1.15
        st.paragraph_format.left_indent = Mm(indent)

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.top_margin, sec.bottom_margin = Mm(22), Mm(20)
    sec.left_margin, sec.right_margin = Mm(25), Mm(25)
    sec.different_first_page_header_footer = True

    # ---- 표지 ----
    band = para(doc, ' ', size=6, after=0)
    shade(band._p.get_or_add_pPr(), '5FB236')
    band2 = para(doc, ' ', size=2, after=22)
    shade(band2._p.get_or_add_pPr(), 'CDEB9B')

    para(doc, 'NALSSAM  RESEARCH & ACTIVITY REPORT', size=10, bold=True, color=LEAF, after=2)
    para(doc, '날샘 연구·활동 보고서', size=13, bold=True, color=FOREST, after=18)
    t = para(doc, '[보고서 제목: 무엇을 어떻게 했는지 드러나게]', size=22, bold=True, color=INK, after=6)
    t.paragraph_format.line_spacing = 1.15
    s = para(doc, '[부제: 결과물 이름 또는 핵심 질문]', size=13, color=FOREST, after=14)
    s.paragraph_format.line_spacing = 1.15
    p = para(doc, after=12); para_border(p, 'bottom', '1F6B2C', 12, 2)

    table(doc, ['항목', '내용'], [
        ['분류', '[ 외부 대회 / 대학 연계 / 교내 활동 / 탐방 / 심화 탐구 ]'],
        ['대회·프로그램명', '[ 예: 2026 START-UPCYCLING THON ]'],
        ['주최·주관', '[ 주최 기관 / 주관 기관 / 협력 학교 ]'],
        ['활동 기간', '[ 2026. 00. 00. ~ 2026. 00. 00. ]'],
        ['팀명', '[ 팀 이름 ]'],
        ['지도교사', '[ 성명 ]'],
        ['제출일', '[ 2026. 00. 00. ]'],
    ], [42, 118], first_col_fill='F2F9E6')

    para(doc, '구성원', size=10, bold=True, color=FOREST, before=6, after=4)
    table(doc, ['학번', '이름', '역할', '주요 담당'], [
        ['[ 00000 ]', '[ 이름 ]', '[ 팀장 · 총괄 ]', '[ 실험 설계, 발표 ]'],
        ['[ 00000 ]', '[ 이름 ]', '[ 역할 ]', '[ 담당 ]'],
        ['[ 00000 ]', '[ 이름 ]', '[ 역할 ]', '[ 담당 ]'],
    ], [26, 30, 40, 64])

    para(doc, '', after=10)
    para(doc, '대전대신고등학교 환경·생태 동아리', size=10, color=MUTE, align=WD_ALIGN_PARAGRAPH.RIGHT, after=0)
    para(doc, '날샘 NALSSAM', size=14, bold=True, color=FOREST, align=WD_ALIGN_PARAGRAPH.RIGHT, after=0)

    # ---- 본문 섹션 (머리말/쪽번호) ----
    body = doc.add_section(WD_SECTION.NEW_PAGE)
    body.different_first_page_header_footer = False
    hp = body.header.paragraphs[0]
    hp.text = ''
    set_font(hp.add_run('날샘 NALSSAM  ·  연구·활동 보고서'), size=8.5, color=MUTE)
    set_font(hp.add_run('\t\t[보고서 제목]'), size=8.5, color=MUTE)
    para_border(hp, 'bottom', 'CDEB9B', 6, 4)
    fp = body.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(fp.add_run('— '), size=9, color=MUTE)
    field(fp, 'PAGE', '1')
    set_font(fp.add_run(' —'), size=9, color=MUTE)

    # 요약
    heading(doc, '요약', 1)
    guide(doc, '보고서 전체를 300~500자로. 「배경(왜) → 목적·가설 → 방법(어떻게) → 핵심 결과(숫자) → 결론·의의」 순서로 한 문단에 씁니다. 본문을 다 쓴 뒤 마지막에 작성하세요.')
    boxed(doc, '국문 요약', ['[ 본 연구(활동)는 … 문제를 해결하기 위해 … 을/를 목표로 하였다. … 방법으로 … 을/를 측정한 결과, … 이/가 … % 감소하였다. 이를 통해 … 을/를 확인하였으며, … 에 활용할 수 있다. ]'])
    p = para(doc, after=4)
    set_font(p.add_run('주제어  '), size=10, bold=True, color=FOREST)
    set_font(p.add_run('[ 키워드1 · 키워드2 · 키워드3 · 키워드4 ]'), size=10, color=RGBColor(0x9A, 0xAE, 0x9C))
    guide(doc, '(선택) 대회·논문 제출용이라면 영문 Abstract와 Keywords를 같은 내용으로 덧붙입니다.')
    page_break(doc)

    # 목차 (목차 자신은 목차에 들어가지 않도록 일반 문단으로)
    p = para(doc, '목차', size=15, bold=True, color=INK, before=0, after=10)
    para_border(p, 'bottom', 'CDEB9B', 10, 4)
    p = para(doc)
    field(p, 'TOC \\o "1-2" \\h \\z \\u', '목차를 갱신하려면 여기를 마우스 오른쪽 클릭 → [필드 업데이트] (한글: [도구] → [차례] → [차례 새로 고침])')
    page_break(doc)

    # 1. 서론
    heading(doc, '1. 서론', 1)
    heading(doc, '1.1 연구(활동) 배경 및 필요성', 2)
    guide(doc, '문제를 보여주는 근거를 제시합니다. 통계·현장 조사·뉴스는 반드시 출처와 연도를 함께 적고, 그 문제가 왜 지금·우리에게 중요한지 연결하세요.')
    bullet(doc, '[ 현황: 국내 연간 발생량 ○○만 t (출처, 연도) ]')
    bullet(doc, '[ 문제점: 대부분 소각·매립되어 ○○ kg CO₂ 배출 ]')
    bullet(doc, '[ 현장 조사: 학교 주변 ○곳 조사 결과 … ]')
    heading(doc, '1.2 연구 목적 및 탐구 질문', 2)
    guide(doc, '목적은 측정 가능한 문장으로, 가설은 「~하면 ~할 것이다」 형태로 씁니다.')
    table(doc, ['구분', '내용'], [
        ['연구 목적', '[ 폐자원 ○○를 이용해 ○○ 성능을 가진 ○○를 만든다 ]'],
        ['탐구 질문', '[ ○○를 바꾸면 ○○는 어떻게 달라지는가? ]'],
        ['가설', '[ ○○의 비율이 높을수록 ○○가 낮아질 것이다 ]'],
    ], [35, 125], first_col_fill='F2F9E6')
    heading(doc, '1.3 선행 연구·사례 조사', 2)
    guide(doc, '비슷한 연구·제품·사례를 2~4개 찾아 「무엇을 했고 → 한계가 무엇이며 → 우리는 무엇이 다른지」를 정리합니다.')
    table(doc, ['선행 연구·사례', '핵심 내용', '한계 / 우리 연구와의 차이'], [
        ['[ 저자(연도) 또는 제품명 ]', '[ 요약 ]', '[ 차별점 ]'],
        ['[ ]', '[ ]', '[ ]'],
    ], [45, 60, 55])

    # 2. 이론적 배경
    heading(doc, '2. 이론적 배경', 1)
    heading(doc, '2.1 핵심 개념', 2)
    guide(doc, '보고서를 이해하는 데 꼭 필요한 개념만 정의합니다. 교과 개념(화학 반응, 열전달, 생태계 순환 등)과 연결하면 세특에 유리합니다.')
    placeholder(doc, '[ 개념 1: 정의와 이 연구에서의 의미 ]')
    placeholder(doc, '[ 개념 2: 원리를 그림이나 식으로 설명 ]')
    heading(doc, '2.2 관련 원리 정리', 2)
    table(doc, ['원리·이론', '설명', '본 연구에서의 적용'], [
        ['[ 예: 탄화층 형성 ]', '[ 리그닌이 타면서 숯이 되어 열을 차단 ]', '[ 커피박의 리그닌 함량 활용 ]'],
        ['[ ]', '[ ]', '[ ]'],
    ], [40, 65, 55])

    # 3. 연구 방법
    heading(doc, '3. 연구 방법', 1)
    heading(doc, '3.1 연구 설계 개요', 2)
    guide(doc, '전체 흐름을 한눈에 보이게 단계도로 그립니다. (예: 시료 수집 → 전처리 → 제작 → 측정 → 분석)')
    boxed(doc, '연구 흐름도', ['[ ① 수집 → ② 전처리 → ③ 제작 → ④ 시험·측정 → ⑤ 분석·개선 ]'], fill='FFFFFF')
    heading(doc, '3.2 재료 및 장치', 2)
    table(doc, ['품목', '규격', '용도', '수량'], [
        ['[ 예: ESP32 개발보드 ]', '[ DevKitC V4 ]', '[ 온도 데이터 수집 ]', '[ 1 ]'],
        ['[ ]', '[ ]', '[ ]', '[ ]'],
        ['[ ]', '[ ]', '[ ]', '[ ]'],
    ], [45, 40, 55, 20])
    heading(doc, '3.3 변인 설정', 2)
    guide(doc, '실험이 있는 연구라면 반드시 채웁니다. 대조군(비교 기준)을 명확히 하세요.')
    table(doc, ['변인', '내용', '설정 값·방법'], [
        ['독립 변인', '[ 바꾼 조건 ]', '[ 예: 배합비 0%, 25%, 50% ]'],
        ['종속 변인', '[ 측정한 결과 ]', '[ 예: 60초 후 뒷면 온도(℃) ]'],
        ['통제 변인', '[ 같게 유지한 조건 ]', '[ 예: 시편 두께 10 mm, 가열 거리 5 cm ]'],
        ['대조군', '[ 비교 기준 ]', '[ 예: 기존 재료로 만든 시편 ]'],
    ], [30, 55, 75], first_col_fill='F2F9E6')
    heading(doc, '3.4 실험(활동) 절차', 2)
    for i, s in enumerate(['[ 시료 준비: … ]', '[ 제작: … ]', '[ 측정: … (반복 횟수 n = 3 이상) ]', '[ 기록: … ]'], 1):
        p = para(doc, after=2)
        p.paragraph_format.left_indent = Mm(6)
        p.paragraph_format.first_line_indent = Mm(-6)
        set_font(p.add_run(f'{i})  '), size=10.5, bold=True, color=FOREST)
        set_font(p.add_run(s), size=10.5, color=RGBColor(0x9A, 0xAE, 0x9C))
    heading(doc, '3.5 데이터 수집·분석 방법', 2)
    placeholder(doc, '[ 측정 도구와 간격(예: 0.25초), 기록 방법, 사용한 분석 방법(평균·표준편차·그래프 비교 등) ]')
    heading(doc, '3.6 안전 및 윤리 고려', 2)
    guide(doc, '가열·화학약품·전기·생물 시료를 다루면 반드시 씁니다. 지도교사 입회 여부, 보호구, 폐기 방법을 적으세요.')
    bullet(doc, '[ 보호안경·장갑 착용, 소화기 비치, 환기되는 공간에서 실시 ]')

    # 4. 결과
    heading(doc, '4. 결과', 1)
    heading(doc, '4.1 결과 요약', 2)
    guide(doc, '가장 중요한 숫자를 먼저 보여줍니다. 해석은 5장에서 하고, 여기서는 사실만 씁니다.')
    table(doc, ['조건', '측정값 1', '측정값 2', '측정값 3', '평균 (± 표준편차)'], [
        ['[ 대조군 ]', '[ ]', '[ ]', '[ ]', '[ ]'],
        ['[ 실험군 A ]', '[ ]', '[ ]', '[ ]', '[ ]'],
        ['[ 실험군 B ]', '[ ]', '[ ]', '[ ]', '[ ]'],
    ], [34, 28, 28, 28, 42])
    caption(doc, '표 1. [ 조건별 측정 결과 — 단위 표기 ]')
    heading(doc, '4.2 세부 결과', 2)
    guide(doc, '그래프·사진은 「그림 번호. 설명」 캡션을 아래에, 표는 「표 번호. 설명」 캡션을 위나 아래에 일관되게 답니다. 축 이름과 단위를 꼭 적으세요.')
    boxed(doc, '그림 영역', ['[ 그래프 또는 사진을 넣으세요 ]', ' ', ' '], fill='FFFFFF')
    caption(doc, '그림 1. [ 시간에 따른 뒷면 온도 변화 (℃) ]')

    # 5. 고찰
    heading(doc, '5. 고찰', 1)
    heading(doc, '5.1 결과 해석 및 가설 검증', 2)
    guide(doc, '가설이 맞았는지/틀렸는지를 결과 숫자로 판단하고, 그 이유를 2장 이론과 연결해 설명합니다.')
    placeholder(doc, '[ 가설은 (지지되었다 / 부분적으로 지지되었다 / 기각되었다). 그 이유는 … ]')
    heading(doc, '5.2 오차 원인 및 한계', 2)
    bullet(doc, '[ 측정 오차: … ]')
    bullet(doc, '[ 시료·환경 한계: … ]')
    heading(doc, '5.3 개선 방향', 2)
    placeholder(doc, '[ 다음에 다시 한다면 무엇을 바꿀지 구체적으로 ]')

    # 6. 결론
    heading(doc, '6. 결론 및 제언', 1)
    heading(doc, '6.1 결론', 2)
    guide(doc, '요약과 비슷하지만, 「알게 된 사실」과 「의의」에 집중해 3~5문장으로 씁니다.')
    placeholder(doc, '[ 본 연구를 통해 … 을/를 확인하였다. … ]')
    heading(doc, '6.2 후속 연구·활동 제언', 2)
    bullet(doc, '[ 후속 탐구 계획, 교과 수업·다른 대회와의 연계 ]')

    # 7. 활동 관리 기록
    heading(doc, '7. 활동 관리 기록', 1)
    guide(doc, '대회·프로그램 보고서와 생활기록부 근거 자료로 쓰이는 부분입니다. 실제 진행한 대로 기록하세요.')
    heading(doc, '7.1 일정표', 2)
    table(doc, ['단계', '기간', '주요 내용', '산출물'], [
        ['[ 1. 주제 선정 ]', '[ 00.00 ~ 00.00 ]', '[ ]', '[ 기획서 ]'],
        ['[ 2. 실험·제작 ]', '[ ]', '[ ]', '[ 시제품 ]'],
        ['[ 3. 발표·제출 ]', '[ ]', '[ ]', '[ 포스터·보고서 ]'],
    ], [34, 34, 58, 34])
    heading(doc, '7.2 역할 분담 및 기여도', 2)
    table(doc, ['이름', '역할', '구체적 기여 내용', '기여도(%)'], [
        ['[ 이름 ]', '[ 역할 ]', '[ 실제로 한 일 ]', '[ 25 ]'],
        ['[ ]', '[ ]', '[ ]', '[ ]'],
    ], [28, 32, 78, 22])
    heading(doc, '7.3 의사결정 기록', 2)
    guide(doc, '아이디어나 방법을 바꾼 순간을 기록합니다. 발표·면접에서 가장 설득력 있는 부분이 됩니다.')
    table(doc, ['날짜', '이전 안', '바뀐 안', '바꾼 이유(근거)'], [
        ['[ 00.00 ]', '[ ]', '[ ]', '[ ]'],
    ], [22, 40, 40, 58])
    heading(doc, '7.4 예산 집행 내역', 2)
    table(doc, ['품목', '구입 목적', '단가(원)', '수량', '합계(원)'], [
        ['[ ]', '[ ]', '[ ]', '[ ]', '[ ]'],
        ['[ ]', '[ ]', '[ ]', '[ ]', '[ ]'],
        ['소계', '', '', '', '[ ]'],
    ], [38, 58, 22, 16, 26])

    # 참고문헌
    heading(doc, '참고문헌', 1)
    guide(doc, 'APA 7판 형식을 권장합니다. 본문에서 인용한 순서 또는 저자 가나다순으로 정리하세요.')
    for ex in ['[ 저자. (연도). 제목. 학술지명, 권(호), 쪽. https://doi.org/… ]',
               '[ 기관명. (연도). 보고서 제목. URL ]',
               '[ 언론사. (연도, 월 일). 기사 제목. URL ]']:
        bullet(doc, ex)

    # 부록
    heading(doc, '부록', 1)
    guide(doc, '원자료(측정값 전체), 학습지·기획서, 코드, 추가 사진, 회의록 등을 첨부합니다. 온라인 자료는 링크와 함께 적으세요.')
    table(doc, ['번호', '자료명', '형태', '링크·위치'], [
        ['부록 A', '[ 원자료 ]', '[ 스프레드시트 ]', '[ ]'],
        ['부록 B', '[ 학습지·기획서 ]', '[ PDF / 캔바 ]', '[ ]'],
        ['부록 C', '[ 코드 ]', '[ .ino / .py ]', '[ ]'],
    ], [22, 52, 36, 50])

    # 체크리스트
    heading(doc, '제출 전 점검표', 1)
    for c in ['요약에 핵심 결과 숫자가 들어갔다', '모든 통계·자료에 출처와 연도를 적었다', '표·그림에 번호와 캡션, 단위를 달았다',
              '변인(독립·종속·통제)과 대조군을 밝혔다', '가설 검증 결과를 결과 숫자로 판단했다', '오차·한계와 개선 방향을 적었다',
              '구성원별 역할과 기여 내용을 구체적으로 적었다', '회색 「작성 안내」 문구와 [ ] 표시를 모두 지웠다', '목차를 갱신했다']:
        p = para(doc, after=2)
        set_font(p.add_run('☐  '), size=11, color=FOREST)
        set_font(p.add_run(c), size=10.5)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc.save(path)
    print('saved', os.path.abspath(path))


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT_DIR, 'nalssam-report.docx')
    build(out)
