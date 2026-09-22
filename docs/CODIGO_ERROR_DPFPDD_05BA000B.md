# Documentación Técnica del Error DPFPDD_E_FAILURE (0x05BA000B / 96075787)

Este documento detalla la referencia técnica encontrada en el repositorio para el código de error devuelto por la función `dpfpdd_query_devices()` de la librería nativa de DigitalPersona.

---

## 1. Archivos en `docs/sdk-reference/`

En la carpeta [`docs/sdk-reference`](./sdk-reference/) se encuentran las cabeceras oficiales en C del SDK DigitalPersona U.are.U:

* [`dpfpdd.h`](./sdk-reference/dpfpdd.h): **U.are.U SDK DP Capture API (v2.0.0)**
  Contiene los tipos de datos, constantes, códigos de error y prototipos de funciones para interactuar con los dispositivos físicos de captura (lectores USB).
* [`dpfj.h`](./sdk-reference/dpfj.h): **U.are.U SDK FingerJet Engine API (v2.0.0)**
  Contiene las funciones para extracción de características biométricas, comparación (*matching*) y conversión de formatos de plantillas.

---

## 2. Identificación y Cálculo del Código de Error

* **Valor Decimal:** `96075787`
* **Valor Hexadecimal:** `0x05BA000B`
* **Nombre de la Constante:** `DPFPDD_E_FAILURE`

### Construcción matemática en el archivo [`dpfpdd.h`](./sdk-reference/dpfpdd.h)

El código de error se construye mediante macros en las líneas 38–40 y 67:

```c
// Líneas 38–40
#ifndef DPERROR
#   define _DP_FACILITY  0x05BA
#   define DPERROR(err)  ((int)err | (_DP_FACILITY << 16))
#endif /* DPERROR */

// Línea 67
#define DPFPDD_E_FAILURE           DPERROR(0x0b)
```

1. `_DP_FACILITY` = `0x05BA`
2. `_DP_FACILITY << 16` = `0x05BA0000`
3. `DPERROR(0x0b)` = `0x000B | 0x05BA0000` = **`0x05BA000B`**
4. En base 10 (decimal): `(5 × 16^7) + (11 × 16^6) + (10 × 16^5) + 11` = **`96075787`**

---

## 3. Definición Textual Oficial del SDK

En [`dpfpdd.h`](./sdk-reference/dpfpdd.h#L62-L68):

```c
/**
\brief Unspecified failure.

"Catch-all" generic failure code. Can be returned by all API calls in case of failure, when the reason for the failure is unknown or cannot be specified.
*/
#define DPFPDD_E_FAILURE           DPERROR(0x0b)
```

### Documentación para `dpfpdd_query_devices()` ([líneas 484–487](./sdk-reference/dpfpdd.h#L484-L487)):

```c
/**
\brief Returns information about connected readers. 

Client application must allocate memory for the list of the available devices and pass number of entries in the dev_cnt parameter. 
If memory is not sufficient to contain information about all connected readers, then DPFPDD_E_MORE_DATA will be returned. 
The number of connected devices will be returned in dev_cnt parameter.

\param dev_cnt    [in] Number of entries in the dev_infos memory block; [out] Number of devices detected
\param dev_infos  [in] Memory block; [out] Information about connected readers (per DPFPDD_DEV_INFO)
\return DPFPDD_SUCCESS:      Information about connected readers obtained; 
\return DPFPDD_E_FAILURE:    Unexpected failure;
\return DPFPDD_E_MORE_DATA:  Insufficient memory in dev_infos memory block for all readers. No data was returned. The required number of entries is in the dev_cnt.
*/
int DPAPICALL dpfpdd_query_devices(
    unsigned int*    dev_cnt,
    DPFPDD_DEV_INFO* dev_infos
);
```

---

## 4. Causa y Diagnóstico Práctico en un PC Nuevo

El código `DPFPDD_E_FAILURE` devuelto por `dpfpdd_query_devices()` indica un **"Fallo inesperado / no especificado"** al interactuar con el subsistema USB o el driver en modo kernel.

Aunque `dpfpdd_init()` retorne `OK` (ya que solo carga la DLL en la memoria del proceso), `dpfpdd_query_devices()` falla por alguna de las siguientes causas en un equipo recién configurado:

1. **Driver incorrecto (Windows Update):**
   * Windows 10/11 suele instalar un controlador genérico por omisión o un driver WBF (*Windows Biometric Framework*).
   * La API de bajo nivel `dpfpdd.dll` requiere el paquete de controladores nativos **DigitalPersona RTE (Run-Time Environment)** o **U.are.U SDK Driver**.
2. **Conflicto con el Servicio `DpHost`:**
   * Si el servicio `DpHost` (*DigitalPersona Authentication Service*) se encuentra activo, bloquea la comunicación con el dispositivo para uso exclusivo de inicio de sesión de Windows.
   * **Comprobación:** Abrir `services.msc` y verificar si el servicio `DigitalPersona` o `DpHost` está en ejecución.
3. **Puerto USB / Suspensión selectiva:**
   * Probar conectando el lector a un puerto **USB 2.0 directo** (evitar HUBs o puertos USB 3.0/3.2 con ahorro de energía agresivo en BIOS).
