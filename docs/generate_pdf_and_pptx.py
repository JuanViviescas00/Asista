# -*- coding: utf-8 -*-
import os
import glob
from PIL import Image, JpegImagePlugin
from pptx import Presentation
from pptx.util import Inches

SLIDES_DIR = 'docs/slides_img'
PDF_OUTPUT = 'docs/PRESENTACION_SISTEMA_ASISTA.pdf'
PPTX_OUTPUT = 'docs/PRESENTACION_SISTEMA_ASISTA.pptx'
PPTX_BACKUP = 'docs/PRESENTACION_SISTEMA_ASISTA_MEJORADA.pptx'

# Guion de orador para inducción de nuevos aprendices
SPEAKER_NOTES = [
    # Slide 1
    "¡Buenos días a todos los nuevos aprendices! Bienvenidos a su formación en el SENA y a la carrera de ADSO. Hoy les presentamos ASISTA, un sistema real concebido, diseñado y construido por aprendices de su misma titulación para automatizar el control biométrico de asistencia y velar por el debido proceso escolar.",
    
    # Slide 2
    "¿Cómo les beneficia a ustedes como aprendices? Primero, rapidez: en menos de un segundo colocan su dedo en el lector óptico y quedan registrados, ahorrando 20 minutos de clase que antes se perdían pasando lista en papel. Segundo, transparencia total: con solo su número de documento consultan en tiempo real sus asistencias y horas acumuladas. Y tercero, radicación digital de excusas médicas en caso de incapacidad.",
    
    # Slide 3
    "Los objetivos de ASISTA son integrar todo el ciclo: desde la captura física con el sensor en el aula hasta la sincronización con Sofia Plus. Cuenta con 4 pilares: identificación rápida 1:N en memoria RAM, operación Offline-First para no detenerse si se cae internet, gestión del debido proceso de justificaciones y un robot RPA que evita errores humanos de transcripción.",
    
    # Slide 4
    "A nivel técnico, ASISTA demuestra lo que aprenderán a crear: en el aula usamos Electron 30 y Koffi FFI para comunicarnos a bajo nivel con las librerías C++ del sensor. En la nube tenemos una API REST con Node.js 22 LTS, WebSockets con Socket.IO y base de datos MongoDB Atlas. En el frontend usamos Vue 3 y Quasar 2, y en la automatización un robot headless con Playwright y GitHub Actions.",
    
    # Slide 5
    "Hablemos de las reglas de asistencia y puntualidad: los primeros 10 minutos son tiempo de gracia (0 horas de falla). De 11 a 60 minutos se computa 1 hora de tardanza. De 61 a 120 minutos se acumulan 2 horas. Pasados 120 minutos se consolida la inasistencia total de la jornada (6h diurna o 5h nocturna). ¡Cuiden su récord de asistencia desde el primer día!",
    
    # Slide 6
    "¿Qué pasa si se enferman o tienen cita médica? El Acuerdo 009 de 2024 les otorga hasta 5 días hábiles (sin contar sábados, domingos ni festivos) para radicar su soporte médico de EPS o SURA en el portal web. Pueden subir una foto clara desde el celular. Al ser aprobado por el instructor líder, las horas se descuentan automáticamente del cálculo de deserción.",
    
    # Slide 7
    "Una pregunta clave: ¿Mi huella está segura? La respuesta es totalmente sí. ASISTA jamás guarda imágenes ni fotos de su huella. El sensor extrae coordenadas matemáticas de minucias y genera una plantilla numérica binaria FMD de una vía, diseñada para prevenir la reconstrucción de la huella física. Además, cumplimos con la Ley 1581 de Habeas Data con autorización previa y cifrado seguro.",
    
    # Slide 8
    "¿Cómo se reporta a Sofia Plus? El sistema no envía fallas de inmediato; las deja en espera 5 días hábiles para darles tiempo de justificar. Los sábados a las 11:00 PM, un robot de software autónomo desarrollado con Playwright abre un navegador seguro en la nube, entra con credenciales cifradas y digita únicamente las fallas que no fueron justificadas, sellándolas con candado de auditoría.",
    
    # Slide 9
    "El monitoreo preventivo de ASISTA no es para sancionar, sino para apoyarlos. Tiene un semáforo: verde (menos del 10% de fallas, todo en orden); amarillo (10% a 14% de fallas, alerta temprana para que su instructor converse con ustedes y pacte un plan de mejoramiento); y rojo (15% o 3 días seguidos injustificados, límite del Reglamento del Aprendiz que activa comité de evaluación).",
    
    # Slide 10
    "Para cerrar: ASISTA ya está operando con más de 129 aprendices registrados, una velocidad de verificación de ~800 milisegundos y fue construido por 5 aprendices de ADSO. En el SENA no solo verán teoría: saldrán listos para crear software de impacto real. ¡Bienvenidos y mucho éxito en su formación profesional integral!"
]

def generate_pdf():
    print("Compiling PDF...")
    image_files = sorted(glob.glob(os.path.join(SLIDES_DIR, 'slide_*.png')))
    if not image_files:
        print("Error: No slide images found in", SLIDES_DIR)
        return False
    
    pil_images = []
    for f in image_files:
        img = Image.open(f)
        # Convert RGBA to RGB with black background
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            bg = Image.new('RGB', img.size, (6, 11, 8))
            bg.paste(img, mask=img.split()[3])
            pil_images.append(bg)
        else:
            pil_images.append(img.convert('RGB'))
    
    pil_images[0].save(
        PDF_OUTPUT,
        save_all=True,
        append_images=pil_images[1:],
        quality=95,
        resolution=150.0
    )
    print(f"PDF successfully generated: {PDF_OUTPUT} ({len(pil_images)} slides)")
    return True

def generate_pptx():
    print("Compiling PPTX...")
    image_files = sorted(glob.glob(os.path.join(SLIDES_DIR, 'slide_*.png')))
    if not image_files:
        print("Error: No slide images found in", SLIDES_DIR)
        return False
    
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6] # Blank slide
    
    for i, img_path in enumerate(image_files):
        slide = prs.slides.add_slide(blank_layout)
        # Add full bleed slide image
        slide.shapes.add_picture(img_path, Inches(0), Inches(0), width=Inches(13.333), height=Inches(7.5))
        
        # Add speaker notes
        if i < len(SPEAKER_NOTES):
            notes_slide = slide.notes_slide
            text_frame = notes_slide.notes_text_frame
            text_frame.text = SPEAKER_NOTES[i]
            
    saved_path = PPTX_OUTPUT
    try:
        prs.save(PPTX_OUTPUT)
        print(f"PPTX successfully saved to primary path: {PPTX_OUTPUT}")
    except PermissionError:
        prs.save(PPTX_BACKUP)
        saved_path = PPTX_BACKUP
        print(f"Primary PPTX was locked by PowerPoint. Saved to: {PPTX_BACKUP}")
        
    return saved_path

if __name__ == '__main__':
    generate_pdf()
    generate_pptx()
