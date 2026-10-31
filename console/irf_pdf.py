"""The Information Request Form as a PDF, laid out from console.irf_schema."""
from fpdf import FPDF
from fpdf.fonts import FontFace

from .irf_schema import SECTIONS

# The PDF core fonts cover Latin-1 only; common characters outside it get a readable stand-in
REPLACEMENTS = {'₹': 'Rs.', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '-'}
NOT_GIVEN = '-'
INK = (33, 37, 41)
MUTED = (120, 128, 136)
ACCENT = (37, 99, 235)


def text(value):
    value = str(value)
    for char, stand_in in REPLACEMENTS.items():
        value = value.replace(char, stand_in)
    return value.encode('latin-1', 'replace').decode('latin-1')


def option_label(field, value, options):
    opts = options.get(field['options'], []) if isinstance(field.get('options'), str) else field.get('options', [])
    return dict(opts).get(value, value)


def show(field, value, options):
    """A field's answer as text; NOT_GIVEN when empty."""
    kind = field['type']
    if value is None or value == '' or value == []:
        return NOT_GIVEN
    if kind == 'yesno':
        return 'Yes' if value else 'No'
    if kind == 'select':
        return option_label(field, value, options)
    if kind == 'multi':
        return ', '.join(str(option_label(field, v, options)) for v in value)
    if kind == 'lines':
        return ', '.join(value)
    return value


class IrfPdf(FPDF):
    def __init__(self, title):
        super().__init__(format='A4')
        self.doc_title = title
        self.set_margins(16, 16, 16)
        self.set_auto_page_break(True, margin=16)
        self.set_title(text(f'Information Request Form - {title}'))

    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica', size=8)
        self.set_text_color(*MUTED)
        self.cell(0, 6, text(f'{self.doc_title} - Information Request Form'), align='L')
        self.cell(0, 6, f'Page {self.page_no()}/{{nb}}', align='R')


def render(form, files, options):
    """PDF bytes for an OnboardingForm. files: OnboardingFile rows (without content)."""
    data = form.data or {}
    pdf = IrfPdf(form.title)
    pdf.add_page()
    width = pdf.epw

    pdf.set_text_color(*INK)
    pdf.set_font('Helvetica', 'B', 18)
    pdf.cell(0, 10, 'Information Request Form', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 11)
    pdf.cell(0, 6, text(form.title), new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(*MUTED)
    when = form.submitted_at.strftime('%d %b %Y %H:%M UTC') if form.submitted_at else None
    status = f'Submitted {when}' if form.status == 'submitted' and when else 'Draft - not submitted yet'
    pdf.cell(0, 6, text(f'Form {form.id} - {status}'), new_x='LMARGIN', new_y='NEXT')
    pdf.ln(2)

    files_by_field = {}
    for file in files:
        files_by_field.setdefault(file.field, []).append(file)

    def heading(title, size=13, color=ACCENT):
        if pdf.get_y() > pdf.h - 40:
            pdf.add_page()
        pdf.ln(3)
        pdf.set_font('Helvetica', 'B', size)
        pdf.set_text_color(*color)
        pdf.cell(0, 8, text(title), new_x='LMARGIN', new_y='NEXT')
        if size >= 13:
            pdf.set_draw_color(*color)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + width, pdf.get_y())
            pdf.ln(1.5)
        pdf.set_text_color(*INK)

    def row(label, value):
        label_w = width * 0.38
        pdf.set_font('Helvetica', '', 9)
        pdf.set_text_color(*MUTED)
        if pdf.get_y() > pdf.h - 28:
            pdf.add_page()
        y = pdf.get_y()
        pdf.multi_cell(label_w - 3, 5.5, text(label), align='L', new_x='LMARGIN', new_y='NEXT')
        label_end = pdf.get_y()
        pdf.set_xy(pdf.l_margin + label_w, y)
        pdf.set_text_color(*(MUTED if value == NOT_GIVEN else INK))
        pdf.set_font('Helvetica', '', 10)
        pdf.multi_cell(width - label_w, 5.5, text(value), align='L', new_x='LMARGIN', new_y='NEXT')
        pdf.set_y(max(label_end, pdf.get_y()) + 0.5)

    def table(field, rows):
        cols = field['fields']
        with pdf.table(headings_style=FontFace(emphasis='BOLD', fill_color=(240, 243, 247)),
                       line_height=5.5, text_align='LEFT', col_widths=[3 if c['type'] == 'text' else 2 for c in cols],
                       first_row_as_headings=True) as t:
            head = t.row()
            for c in cols:
                head.cell(text(c['label']))
            for r in rows:
                line = t.row()
                for c in cols:
                    line.cell(text(show(c, r.get(c['key']), options)))

    def fields(defs, values, path):
        for fld in defs:
            key_path = f'{path}.{fld["key"]}'
            if fld['type'] == 'file':
                names = [f'{x.name} ({max(1, round(x.size / 1024))} KB)' for x in files_by_field.get(key_path, [])]
                row(fld['label'], '\n'.join(names) or NOT_GIVEN)
            elif fld['type'] == 'list':
                rows = values.get(fld['key']) or []
                if not rows:
                    row(fld['label'], NOT_GIVEN)
                    continue
                pdf.set_font('Helvetica', 'B', 10)
                pdf.set_text_color(*INK)
                pdf.cell(0, 7, text(f'{fld["label"]} ({len(rows)})'), new_x='LMARGIN', new_y='NEXT')
                pdf.set_font('Helvetica', '', 9)
                table(fld, rows)
                pdf.ln(2)
            else:
                row(fld['label'], show(fld, values.get(fld['key']), options))

    for number, section in enumerate(SECTIONS, start=1):
        heading(f'{number}. {section["title"]}')
        value = data.get(section['key'])
        if section.get('type') == 'list':
            items = value or []
            if not items:
                row(section['title'], NOT_GIVEN)
            elif all(c['type'] not in ('list', 'textarea', 'file') for c in section['fields']):
                pdf.set_font('Helvetica', '', 9)
                table(section, items)
            else:
                for i, item in enumerate(items, start=1):
                    heading(f'{section["item"]} {i}', size=11, color=INK)
                    fields(section['fields'], item, f'{section["key"]}.{i - 1}')
        else:
            fields(section['fields'], value or {}, section['key'])

    return bytes(pdf.output())
