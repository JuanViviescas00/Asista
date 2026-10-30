import os
import re
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Establece el color de fondo de una celda."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Establece márgenes internos de celda en dxa (20 dxa = 1 pt)."""
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def set_table_borders(table, color="CCCCCC", sz="4", val="single"):
    """Aplica bordes limpios y formales a la tabla."""
    tblPr = table._element.xpath('w:tblPr')
    if tblPr:
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'<w:insideV w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>'
            f'</w:tblBorders>'
        )
        tblPr[0].append(borders)

def make_callout(doc, text, title="NOTA INSTITUCIONAL", border_color="39A900", bg_color="F7FDF7"):
    """Crea una caja de aviso sobria con borde izquierdo institucional."""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=180, right=140)
    
    tcPr = cell._element.get_or_add_tcPr()
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:left w:val="single" w:sz="20" w:space="0" w:color="{border_color}"/>'
        f'<w:top w:val="none"/>'
        f'<w:bottom w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    
    run_t = p.add_run(f"{title}: ")
    run_t.bold = True
    run_t.font.name = 'Segoe UI'
    run_t.font.size = Pt(9.5)
    run_t.font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
    
    run_b = p.add_run(text)
    run_b.font.name = 'Segoe UI'
    run_b.font.size = Pt(9.5)
    run_b.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(0)
    p_after.paragraph_format.space_after = Pt(4)

def construir_manual_word():
    print("Iniciando generación de Manual Word institucional SENA...")
    doc = Document()
    
    # Márgenes de 2.3 cm (aprox 0.9 in)
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11.0)
    section.top_margin = Inches(0.85)
    section.bottom_margin = Inches(0.85)
    section.left_margin = Inches(0.85)
    section.right_margin = Inches(0.85)
    
    section.different_first_page_header_footer = True
    
    # ENCABEZADO DE PÁGINAS INTERNAS
    header = section.header
    header_tbl = header.add_table(1, 3, Inches(6.8))
    header_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(header_tbl, color="D1D5DB", sz="4")
    
    c_h0 = header_tbl.cell(0, 0)
    c_h0.width = Inches(1.1)
    set_cell_margins(c_h0, top=50, bottom=50, left=70, right=70)
    c_h0.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_logo = c_h0.paragraphs[0]
    p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if os.path.exists("docs/sena_logo.png"):
        p_logo.add_run().add_picture("docs/sena_logo.png", width=Inches(0.6))
        
    c_h1 = header_tbl.cell(0, 1)
    c_h1.width = Inches(4.0)
    set_cell_margins(c_h1, top=50, bottom=50, left=80, right=80)
    c_h1.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_htxt = c_h1.paragraphs[0]
    p_htxt.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_h1 = p_htxt.add_run("SERVICIO NACIONAL DE APRENDIZAJE — SENA\n")
    r_h1.bold = True
    r_h1.font.name = 'Segoe UI'
    r_h1.font.size = Pt(8.5)
    r_h1.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    r_h2 = p_htxt.add_run("MANUAL DE USUARIO · SISTEMA ASISTA (ADSO)")
    r_h2.font.name = 'Segoe UI'
    r_h2.font.size = Pt(8)
    r_h2.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)
    
    c_h2 = header_tbl.cell(0, 2)
    c_h2.width = Inches(1.7)
    set_cell_margins(c_h2, top=50, bottom=50, left=70, right=70)
    c_h2.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_hmeta = c_h2.paragraphs[0]
    p_hmeta.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r_hm = p_hmeta.add_run("Código: ADSO-MU-01\nVersión: 1.0\nOctubre 2026")
    r_hm.font.name = 'Segoe UI'
    r_hm.font.size = Pt(7.5)
    r_hm.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # PIE DE PÁGINA
    footer = section.footer
    f_p = footer.paragraphs[0]
    f_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    f_run = f_p.add_run("SENA · Centro de Formación en Actividades de Servicios — Regional Distrito Capital")
    f_run.font.name = 'Segoe UI'
    f_run.font.size = Pt(8.5)
    f_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # =============================================================
    # PÁGINA 1: PORTADA SOBRIA Y FORMAL (ESTILO SENA / EJEMPLO)
    # =============================================================
    
    # 1. ENCABEZADO SUPERIOR DE CONTROL INSTITUCIONAL
    tbl_portada_hdr = doc.add_table(rows=1, cols=3)
    tbl_portada_hdr.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_portada_hdr, color="A0AEC0", sz="6")
    
    # Celda 0: Logo SENA
    c_p0 = tbl_portada_hdr.cell(0, 0)
    c_p0.width = Inches(1.3)
    set_cell_margins(c_p0, top=100, bottom=100, left=100, right=100)
    c_p0.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_plogo = c_p0.paragraphs[0]
    p_plogo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if os.path.exists("docs/sena_logo.png"):
        p_plogo.add_run().add_picture("docs/sena_logo.png", width=Inches(0.95))
        
    # Celda 1: Macroproceso y Proceso
    c_p1 = tbl_portada_hdr.cell(0, 1)
    c_p1.width = Inches(3.8)
    set_cell_margins(c_p1, top=100, bottom=100, left=120, right=120)
    c_p1.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_ptxt = c_p1.paragraphs[0]
    p_ptxt.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    r_pt1 = p_ptxt.add_run("SERVICIO NACIONAL DE APRENDIZAJE — SENA\n")
    r_pt1.bold = True
    r_pt1.font.name = 'Segoe UI'
    r_pt1.font.size = Pt(9.5)
    r_pt1.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    
    r_pt2 = p_ptxt.add_run("SISTEMA INTEGRADO DE GESTIÓN Y AUTOCONTROL (SIGA)\n")
    r_pt2.font.name = 'Segoe UI'
    r_pt2.font.size = Pt(8)
    r_pt2.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)
    
    r_pt3 = p_ptxt.add_run("PROCESO: GESTIÓN DE LA FORMACIÓN PROFESIONAL INTEGRAL")
    r_pt3.font.name = 'Segoe UI'
    r_pt3.font.size = Pt(8)
    r_pt3.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    
    # Celda 2: Metadatos
    c_p2 = tbl_portada_hdr.cell(0, 2)
    c_p2.width = Inches(1.7)
    set_cell_margins(c_p2, top=100, bottom=100, left=100, right=100)
    c_p2.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p_pmeta = c_p2.paragraphs[0]
    p_pmeta.alignment = WD_ALIGN_PARAGRAPH.LEFT
    
    r_pm = p_pmeta.add_run("CÓDIGO: F-TI-ADSO-01\nVERSIÓN: 1.0\nFECHA: Octubre 2026\nPÁGINA: 1 de 25")
    r_pm.font.name = 'Segoe UI'
    r_pm.font.size = Pt(8)
    r_pm.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    # 2. ESPACIADO VERTICAL HACIA EL CENTRO
    p_sp1 = doc.add_paragraph()
    p_sp1.paragraph_format.space_before = Pt(50)
    p_sp1.paragraph_format.space_after = Pt(0)

    # 3. BLOQUE CENTRAL SOBRIO (En el centro de la página)
    p_t1 = doc.add_paragraph()
    p_t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t1.paragraph_format.space_before = Pt(0)
    p_t1.paragraph_format.space_after = Pt(6)
    r_t1 = p_t1.add_run("MANUAL DE USUARIO")
    r_t1.bold = True
    r_t1.font.name = 'Segoe UI'
    r_t1.font.size = Pt(26)
    r_t1.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)

    p_t2 = doc.add_paragraph()
    p_t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t2.paragraph_format.space_before = Pt(0)
    p_t2.paragraph_format.space_after = Pt(10)
    r_t2 = p_t2.add_run("SISTEMA ASISTA")
    r_t2.bold = True
    r_t2.font.name = 'Segoe UI'
    r_t2.font.size = Pt(22)
    r_t2.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)

    p_t3 = doc.add_paragraph()
    p_t3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t3.paragraph_format.space_before = Pt(0)
    p_t3.paragraph_format.space_after = Pt(22)
    r_t3 = p_t3.add_run("Sistema de Control Biométrico de Asistencia y Gestión de Inasistencias en Ambiente de Formación")
    r_t3.italic = True
    r_t3.font.name = 'Segoe UI'
    r_t3.font.size = Pt(11)
    r_t3.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    # LOGO OFICIAL DEL SISTEMA CENTRADO
    if os.path.exists("docs/asista_logo.png"):
        p_alogo = doc.add_paragraph()
        p_alogo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_alogo.paragraph_format.space_before = Pt(0)
        p_alogo.paragraph_format.space_after = Pt(40)
        p_alogo.add_run().add_picture("docs/asista_logo.png", width=Inches(1.8))

    # 4. TABLA DE RESPONSABILIDADES Y APROBACIÓN
    tbl_aprob = doc.add_table(rows=2, cols=2)
    tbl_aprob.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_aprob, color="CBD5E1", sz="6")
    
    cell_el = tbl_aprob.cell(0, 0)
    cell_el.width = Inches(3.4)
    set_cell_background(cell_el, "F1F5F9")
    set_cell_margins(cell_el, top=80, bottom=80, left=100, right=100)
    p_el_hdr = cell_el.paragraphs[0]
    p_el_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_elh = p_el_hdr.add_run("ELABORADO POR")
    r_elh.bold = True
    r_elh.font.name = 'Segoe UI'
    r_elh.font.size = Pt(9.5)
    r_elh.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    
    cell_ap = tbl_aprob.cell(0, 1)
    cell_ap.width = Inches(3.4)
    set_cell_background(cell_ap, "F1F5F9")
    set_cell_margins(cell_ap, top=80, bottom=80, left=100, right=100)
    p_ap_hdr = cell_ap.paragraphs[0]
    p_ap_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_aph = p_ap_hdr.add_run("REVISADO Y APROBADO POR")
    r_aph.bold = True
    r_aph.font.name = 'Segoe UI'
    r_aph.font.size = Pt(9.5)
    r_aph.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    
    cell_el_body = tbl_aprob.cell(1, 0)
    cell_el_body.width = Inches(3.4)
    set_cell_margins(cell_el_body, top=100, bottom=100, left=100, right=100)
    p_elb = cell_el_body.paragraphs[0]
    p_elb.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_el1 = p_elb.add_run("Juan Camilo Viviescas Triana\n")
    r_el1.bold = True
    r_el1.font.name = 'Segoe UI'
    r_el1.font.size = Pt(9.5)
    r_el1.font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
    r_el2 = p_elb.add_run("Equipo de Desarrollo de Software ADSO")
    r_el2.font.name = 'Segoe UI'
    r_el2.font.size = Pt(8.5)
    r_el2.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    
    cell_ap_body = tbl_aprob.cell(1, 1)
    cell_ap_body.width = Inches(3.4)
    set_cell_margins(cell_ap_body, top=100, bottom=100, left=100, right=100)
    p_apb = cell_ap_body.paragraphs[0]
    p_apb.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_ap1 = p_apb.add_run("Instructor(a) Técnico de Proyecto\n")
    r_ap1.bold = True
    r_ap1.font.name = 'Segoe UI'
    r_ap1.font.size = Pt(9.5)
    r_ap1.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    r_ap2 = p_apb.add_run("Coordinación Académica de Teleinformática")
    r_ap2.font.name = 'Segoe UI'
    r_ap2.font.size = Pt(8.5)
    r_ap2.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    # 5. BLOQUE INFERIOR INSTITUCIONAL CENTRADO
    p_inf = doc.add_paragraph()
    p_inf.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_inf.paragraph_format.space_before = Pt(30)
    p_inf.paragraph_format.space_after = Pt(0)
    
    r_in1 = p_inf.add_run("CENTRO DE FORMACIÓN EN ACTIVIDADES DE SERVICIOS\n")
    r_in1.bold = True
    r_in1.font.name = 'Segoe UI'
    r_in1.font.size = Pt(11)
    r_in1.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
    
    r_in2 = p_inf.add_run("REGIONAL DISTRITO CAPITAL\n")
    r_in2.bold = True
    r_in2.font.name = 'Segoe UI'
    r_in2.font.size = Pt(10)
    r_in2.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)
    
    r_in3 = p_inf.add_run("TECNOLOGÍA EN ANÁLISIS Y DESARROLLO DE SOFTWARE (ADSO)\n")
    r_in3.font.name = 'Segoe UI'
    r_in3.font.size = Pt(9.5)
    r_in3.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
    
    r_in4 = p_inf.add_run("BOGOTÁ D.C., COLOMBIA — 2026")
    r_in4.font.name = 'Segoe UI'
    r_in4.font.size = Pt(9.5)
    r_in4.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    doc.add_page_break()

    # =============================================================
    # PÁGINA 2: CONTROL DEL DOCUMENTO Y TABLA DE CONTENIDO
    # =============================================================
    h_ctrl = doc.add_paragraph()
    h_ctrl.paragraph_format.space_before = Pt(10)
    h_ctrl.paragraph_format.space_after = Pt(6)
    run_hc = h_ctrl.add_run("CONTROL DEL DOCUMENTO")
    run_hc.bold = True
    run_hc.font.name = 'Segoe UI'
    run_hc.font.size = Pt(15)
    run_hc.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)

    ctrl_data = [
        ("Nombre del Documento", "Manual de Usuario Oficial — Sistema ASISTA"),
        ("Código del Documento", "F-TI-ADSO-01 / Versión 1.0"),
        ("Programa de Formación", "Tecnología en Análisis y Desarrollo de Software (ADSO)"),
        ("Centro de Formación", "Centro de Formación en Actividades de Servicios — Regional Distrito Capital"),
        ("Autor / Desarrollador", "Juan Camilo Viviescas Triana y Equipo ADSO"),
        ("Destinatarios", "Instructores, Aprendices, Coordinadores y Administradores"),
        ("Normativa Aplicada", "Acuerdo 009 de 2024 (Reglamento del Aprendiz SENA) y Ley 1581 de 2012 (Habeas Data)"),
        ("Fecha de Publicación", "Octubre de 2026")
    ]

    tbl_ctrl = doc.add_table(rows=len(ctrl_data) + 1, cols=2)
    tbl_ctrl.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(tbl_ctrl, color="CBD5E1", sz="6")
    
    hdr_cells = tbl_ctrl.rows[0].cells
    hdr_cells[0].text = "Campo de Control"
    hdr_cells[1].text = "Detalle Institucional"
    hdr_cells[0].width = Inches(2.2)
    hdr_cells[1].width = Inches(4.6)
    for c in hdr_cells:
        set_cell_background(c, "F1F5F9")
        set_cell_margins(c, top=100, bottom=100, left=120, right=120)
        p = c.paragraphs[0]
        p.runs[0].font.bold = True
        p.runs[0].font.name = 'Segoe UI'
        p.runs[0].font.size = Pt(9.5)
        p.runs[0].font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)

    for i, (campo, det) in enumerate(ctrl_data):
        row_cells = tbl_ctrl.rows[i + 1].cells
        row_cells[0].width = Inches(2.2)
        row_cells[1].width = Inches(4.6)
        row_cells[0].text = campo
        row_cells[1].text = det
        
        bg = "F8FAFC" if i % 2 == 1 else "FFFFFF"
        for idx, c in enumerate(row_cells):
            set_cell_background(c, bg)
            set_cell_margins(c, top=80, bottom=80, left=120, right=120)
            p = c.paragraphs[0]
            if p.runs:
                p.runs[0].font.name = 'Segoe UI'
                p.runs[0].font.size = Pt(9)
                if idx == 0:
                    p.runs[0].font.bold = True
                    p.runs[0].font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
                else:
                    p.runs[0].font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # TABLA DE CONTENIDO FORMAL
    h_toc = doc.add_paragraph()
    h_toc.paragraph_format.space_before = Pt(8)
    h_toc.paragraph_format.space_after = Pt(6)
    r_toc = h_toc.add_run("TABLA DE CONTENIDO")
    r_toc.bold = True
    r_toc.font.name = 'Segoe UI'
    r_toc.font.size = Pt(15)
    r_toc.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)

    toc_items = [
        ("1. INFORMACIÓN GENERAL DEL SISTEMA", [
            "1.1 Alcance del Sistema",
            "1.2 Requisitos de Conocimiento del Usuario",
            "1.3 Requerimientos de Hardware y Software (Estación Kiosco y Cliente Web)",
            "1.4 Política de Seguridad y Tratamiento de Datos (Habeas Data)",
            "1.5 Convenciones y Simbología",
            "1.6 Mapa de Navegación del Sistema"
        ]),
        ("2. MÓDULOS DE AUTENTICACIÓN Y ACCESO", [
            "2.1 Acceso Personal (Instructores y Administradores)",
            "2.2 Consulta de Aprendiz (Ingreso por Documento)",
            "2.3 Recuperación de Contraseña"
        ]),
        ("3. PORTAL DEL APRENDIZ", [
            "3.1 Consulta de Inasistencias y Horas Acumuladas",
            "3.2 Radicación de Excusas Justificadas (Acuerdo 009 de 2024)"
        ]),
        ("4. PORTAL DEL INSTRUCTOR", [
            "4.1 Panel de Mis Fichas / Grupos Asignados",
            "4.2 Toma de Asistencia Manual y Contingencia en Aula",
            "4.3 Gestión y Aprobación de Excusas Radicadas"
        ]),
        ("5. MÓDULOS DE ADMINISTRACIÓN DEL SISTEMA", [
            "5.1 Perfil y Métricas del Administrador",
            "5.2 Gestión de Instructores",
            "5.3 Gestión de Aprendices",
            "5.4 Gestión de Fichas y Asignación de Docentes",
            "5.5 Gestión y Aprobación de Dispositivos (Huelleros en Aula)",
            "5.6 Carga Masiva e Importación de Usuarios (Excel / CSV)",
            "5.7 Generación de Reportes y Descargas",
            "5.8 Seguimiento de Inasistencias y Alerta Temprana de Deserción",
            "5.9 Gestión de Días Inhabilitados y Festivos"
        ]),
        ("6. APLICACIÓN DE AULA (KIOSCO HUELLERO DE ESCRITORIO)", [
            "6.1 Instalación y Ejecución de ASISTA Desktop",
            "6.2 Inicio de Clase por el Docente",
            "6.3 Marcación Biométrica Dactilar (1:N)",
            "6.4 Reglas de Tolerancia, Retardos y Auto-Cierre",
            "6.5 Módulo de Enrolamiento de Huellas Dactilares"
        ]),
        ("7. SOPORTE TÉCNICO, MESA DE AYUDA Y ERRORES", [
            "7.1 Directorio de Mesa de Ayuda",
            "7.2 Protocolo de Escalamiento a Tres Niveles",
            "7.3 Catálogo de Errores Frecuentes y Soluciones"
        ])
    ]

    for chap, subs in toc_items:
        p_c = doc.add_paragraph()
        p_c.paragraph_format.space_before = Pt(4)
        p_c.paragraph_format.space_after = Pt(1)
        rc = p_c.add_run(chap)
        rc.bold = True
        rc.font.name = 'Segoe UI'
        rc.font.size = Pt(9.5)
        rc.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
        for s in subs:
            p_s = doc.add_paragraph()
            p_s.paragraph_format.left_indent = Inches(0.25)
            p_s.paragraph_format.space_before = Pt(0)
            p_s.paragraph_format.space_after = Pt(1)
            rs = p_s.add_run(s)
            rs.font.name = 'Segoe UI'
            rs.font.size = Pt(9)
            rs.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_page_break()

    # =============================================================
    # CONTENIDO DEL MANUAL (Capítulos 1 a 7)
    # =============================================================
    with open("docs/MANUAL_DE_USUARIO.md", "r", encoding="utf-8") as f:
        md_text = f.read()

    lines = md_text.splitlines()

    start_index = 0
    for idx, l in enumerate(lines):
        if re.match(r'^#\s+Cap\w*\s+1\b', l.strip(), re.IGNORECASE):
            start_index = idx
            break

    table_rows = []

    def procesar_tabla_acumulada(rows_data):
        if not rows_data:
            return
        
        parsed_rows = []
        for r in rows_data:
            cols = [c.strip() for c in r.strip().strip('|').split('|')]
            if cols and not all(set(c) <= {'-', ':', ' '} for c in cols):
                parsed_rows.append(cols)
        
        if not parsed_rows:
            return

        num_cols = max(len(r) for r in parsed_rows)
        for r in parsed_rows:
            while len(r) < num_cols:
                r.append("")

        tbl = doc.add_table(rows=len(parsed_rows), cols=num_cols)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        set_table_borders(tbl, color="CBD5E1", sz="6")

        for row_idx, row in enumerate(parsed_rows):
            is_header = (row_idx == 0)
            bg_color = "F1F5F9" if is_header else ("F8FAFC" if row_idx % 2 == 1 else "FFFFFF")
            
            for col_idx, val in enumerate(row):
                cell = tbl.cell(row_idx, col_idx)
                set_cell_background(cell, bg_color)
                set_cell_margins(cell, top=90, bottom=90, left=110, right=110)
                cell.text = val
                
                p = cell.paragraphs[0]
                if is_header:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in p.runs:
                        run.font.bold = True
                        run.font.name = 'Segoe UI'
                        run.font.size = Pt(9.5)
                        run.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
                else:
                    if col_idx == 0 and len(val) <= 4:
                        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for run in p.runs:
                        run.font.name = 'Segoe UI'
                        run.font.size = Pt(9)
                        if col_idx == 0:
                            run.font.bold = True
                            run.font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
                        else:
                            run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
        
        doc.add_paragraph().paragraph_format.space_after = Pt(4)

    i = start_index
    while i < len(lines):
        line = lines[i].strip()

        # Detección de tablas Markdown
        if line.startswith("|") and line.endswith("|"):
            table_rows.append(line)
            i += 1
            continue
        elif table_rows:
            procesar_tabla_acumulada(table_rows)
            table_rows = []

        if not line:
            i += 1
            continue

        # Encabezado Capítulo (# Capítulo X)
        if re.match(r'^#\s+Cap\w*', line, re.IGNORECASE):
            doc.add_page_break()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)
            run = p.add_run(line.replace("#", "").strip())
            run.bold = True
            run.font.name = 'Segoe UI'
            run.font.size = Pt(16)
            run.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)
            i += 1
            continue

        # Subsección (### X.X)
        if line.startswith("### "):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(3)
            run = p.add_run(line.replace("###", "").strip())
            run.bold = True
            run.font.name = 'Segoe UI'
            run.font.size = Pt(12.5)
            run.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
            i += 1
            continue

        # Sub-subsección (#### ...)
        if line.startswith("#### "):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run(line.replace("####", "").strip())
            run.bold = True
            run.font.name = 'Segoe UI'
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
            i += 1
            continue

        # Imágenes Markdown: ![Alt](path)
        img_match = re.search(r'!\[([^\]]*)\]\(([^)]+)\)', line)
        if img_match:
            alt = img_match.group(1)
            img_rel_path = img_match.group(2).strip()
            
            full_img_path = os.path.abspath(os.path.join("docs", img_rel_path))
            if not os.path.exists(full_img_path):
                full_img_path = os.path.abspath(img_rel_path)

            if os.path.exists(full_img_path) and not full_img_path.endswith('.svg'):
                p_img = doc.add_paragraph()
                p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_img.paragraph_format.space_before = Pt(8)
                p_img.paragraph_format.space_after = Pt(2)
                p_img.add_run().add_picture(full_img_path, width=Inches(5.7))
                
                # Siguiente línea suele ser *Figura X.X: ...*
                if i + 1 < len(lines) and lines[i + 1].strip().startswith("*Figura"):
                    cap_line = lines[i + 1].strip().strip("*")
                    p_cap = doc.add_paragraph()
                    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p_cap.paragraph_format.space_before = Pt(2)
                    p_cap.paragraph_format.space_after = Pt(10)
                    r_cap = p_cap.add_run(cap_line)
                    r_cap.italic = True
                    r_cap.font.name = 'Segoe UI'
                    r_cap.font.size = Pt(8.5)
                    r_cap.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
                    i += 2
                    continue
            i += 1
            continue

        # Diagramas Mermaid
        if line.startswith("```mermaid"):
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                i += 1
            if i < len(lines):
                i += 1
            make_callout(
                doc,
                "Estructura de Navegación: Inicio de Sesión → Validación de Rol (Personal vs Aprendiz) → "
                "Redirección a Portal correspondiente (Admin: 9 submódulos | Instructor: Mis Fichas, "
                "Toma de Asistencia y Excusas | Aprendiz: Historial y Radicación de Excusas).",
                title="DIAGRAMA DE NAVEGACIÓN Y FLUJO OPERATIVO",
                border_color="39A900",
                bg_color="F7FDF7"
            )
            continue

        # Bloques de código
        if line.startswith("```"):
            i += 1
            code_block = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_block.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            if code_block:
                p_code = doc.add_paragraph()
                p_code.paragraph_format.left_indent = Inches(0.2)
                p_code.paragraph_format.space_before = Pt(3)
                p_code.paragraph_format.space_after = Pt(5)
                r_c = p_code.add_run("\n".join(code_block))
                r_c.font.name = 'Consolas'
                r_c.font.size = Pt(8.5)
                r_c.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
            continue

        # Viñetas (* o -)
        if line.startswith("* ") or line.startswith("- "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.2)
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(2)
            
            clean_text = line[2:].strip()
            parts = re.split(r'(\*\*[^*]+\*\*)', clean_text)
            r_bullet = p.add_run("• ")
            r_bullet.bold = True
            r_bullet.font.color.rgb = RGBColor(0x39, 0xA9, 0x00)
            
            for part in parts:
                if part.startswith("**") and part.endswith("**"):
                    r = p.add_run(part[2:-2])
                    r.bold = True
                    r.font.name = 'Segoe UI'
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
                else:
                    r = p.add_run(part)
                    r.font.name = 'Segoe UI'
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
            i += 1
            continue

        # Pasos numerados
        num_match = re.match(r'^(\d+\.|\bPaso \d+:?)\s*(.*)', line)
        if num_match:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.2)
            p.paragraph_format.space_before = Pt(1.5)
            p.paragraph_format.space_after = Pt(2)
            
            num_label = num_match.group(1)
            rest_text = num_match.group(2)
            
            rn = p.add_run(f"{num_label} ")
            rn.bold = True
            rn.font.name = 'Segoe UI'
            rn.font.size = Pt(9.5)
            rn.font.color.rgb = RGBColor(0x1F, 0x5C, 0x00)
            
            parts = re.split(r'(\*\*[^*]+\*\*)', rest_text)
            for part in parts:
                if part.startswith("**") and part.endswith("**"):
                    r = p.add_run(part[2:-2])
                    r.bold = True
                    r.font.name = 'Segoe UI'
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
                else:
                    r = p.add_run(part)
                    r.font.name = 'Segoe UI'
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
            i += 1
            continue

        # Párrafos normales
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.15
        
        parts = re.split(r'(\*\*[^*]+\*\*)', line)
        for part in parts:
            if part.startswith("**") and part.endswith("**"):
                r = p.add_run(part[2:-2])
                r.bold = True
                r.font.name = 'Segoe UI'
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(0x0F, 0x2B, 0x38)
            else:
                r = p.add_run(part)
                r.font.name = 'Segoe UI'
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

        i += 1

    if table_rows:
        procesar_tabla_acumulada(table_rows)

    out_path = os.path.abspath("docs/MANUAL_DE_USUARIO_ASISTA_OFICIAL.docx")
    doc.save(out_path)
    print(f"¡Manual Word formal institucional guardado en: {out_path}!")

    # Intentar actualizar también MANUAL_DE_USUARIO_ASISTA.docx si no está bloqueado
    try:
        doc.save(os.path.abspath("docs/MANUAL_DE_USUARIO_ASISTA.docx"))
        print("También actualizado docs/MANUAL_DE_USUARIO_ASISTA.docx")
    except PermissionError:
        pass

if __name__ == "__main__":
    construir_manual_word()
