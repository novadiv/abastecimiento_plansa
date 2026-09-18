"""
Registro de órdenes de compra en NetComercial.

ESTADO: LA SECUENCIA TODAVÍA ES UNA SUPOSICIÓN
----------------------------------------------
La estructura de este archivo está terminada: de dónde salen las
coordenadas, cómo se recorren las líneas, qué se reporta a la bitácora, qué
se verifica antes de dar una orden por grabada. Lo que NO está confirmado es
la secuencia concreta de NetComercial — qué menú, qué campos, cuáles avanzan
con Enter y cuáles necesitan clic, qué diálogo sale al grabar.

Eso no se puede deducir mirando código: hay que verlo. Por eso el archivo
arranca con un cerrojo:

    SECUENCIA_CONFIRMADA = False

Mientras siga en False, la estrategia **se niega a ejecutar** con un mensaje
que explica por qué. Es deliberado: correr una secuencia inventada contra un
ERP de producción sin ambiente de pruebas es exactamente el error que este
proyecto no se puede permitir.

CÓMO SE COMPLETA
----------------
1. Mapear las pantallas (ver `GUIA_MAPEO.md`).
2. Escribir la secuencia real en los métodos marcados con `# CONFIRMAR`.
3. Recortar las imágenes de validación en `img-validar/`.
4. Poner el cerrojo en True.
5. Probar con UNA sola orden, mirando la pantalla en vivo.
"""

from __future__ import annotations

from typing import Any

import pyautogui

from ..commons import perfiles
from ..core.registry import register
from ..core.strategy_base import RegistroStrategy

# ══════════════════════════════════════════════════════════════════
# EL CERROJO — ponlo en True solo cuando la secuencia esté verificada
# contra la pantalla real de NetComercial.
# ══════════════════════════════════════════════════════════════════
SECUENCIA_CONFIRMADA = False


# Las pantallas que esta estrategia necesita tener mapeadas.
PANTALLAS = ("menu_ordenes_compra", "oc_cabecera", "oc_detalle", "oc_cierre")


class SecuenciaSinConfirmar(RuntimeError):
    """El cerrojo sigue puesto: la secuencia no se ha verificado a mano."""


@register(
    code="oc",
    name="Órdenes de compra — NetComercial",
    description="Registra una orden por proveedor, con todas sus líneas dentro.",
)
class OrdenCompraStrategy(RegistroStrategy):

    def get_nombre(self) -> str:
        return "Órdenes de compra — NetComercial"

    # ── Coordenadas ──────────────────────────────────────────────

    def get_coordenadas_especificas(self) -> dict[str, tuple[int, int]]:
        """Junta las coordenadas de las cuatro pantallas en un solo mapa.

        Las coordenadas NO se escriben aquí: salen de los perfiles mapeados
        con `mapear.py`, que traen además la huella de la pantalla. Cargar
        un perfil verifica esa huella, así que si alguien cambió la
        resolución del RDP, el bot se detiene aquí — antes de hacer ningún
        clic.
        """
        mapa: dict[str, tuple[int, int]] = {}
        faltantes: list[str] = []
        for pantalla in PANTALLAS:
            try:
                mapa.update(perfiles.cargar(pantalla).como_diccionario())
            except perfiles.PerfilNoEncontrado:
                faltantes.append(pantalla)
        if faltantes:
            raise perfiles.PerfilNoEncontrado(
                "Faltan por mapear estas pantallas: " + ", ".join(faltantes) +
                ".\nMapéalas con:  python mapear.py <pantalla>   (ver GUIA_MAPEO.md)"
            )
        return mapa

    def get_campos_requeridos(self) -> list[str]:
        return ["clave", "lineas"]

    # ── Preparación del dato ─────────────────────────────────────

    def preparar_dato(self, data: dict[str, Any]) -> dict[str, Any]:
        """Normaliza lo que llega de la cola a lo que espera el formulario.

        La orden llega tal como la vio el comprador en «Órdenes a girar».
        Aquí se traduce a los campos del ERP y se descartan las líneas sin
        cantidad: una línea con cantidad cero no es una compra, y meterla
        solo sirve para que alguien tenga que borrarla después.
        """
        lineas = [
            {
                "codigo": str(l.get("codigo", "")).strip(),
                "cantidad": float(l.get("cantidad") or 0),
                "precio": float(l.get("precio") or 0),
                "descripcion": str(l.get("descripcion", "")),
            }
            for l in (data.get("lineas") or [])
        ]
        lineas = [l for l in lineas if l["codigo"] and l["cantidad"] > 0]

        return {
            **data,
            "proveedor_codigo": str(data.get("proveedor_id") or data.get("clave") or "").strip(),
            "proveedor_nombre": str(data.get("etiqueta") or data.get("proveedor") or ""),
            "lineas": lineas,
            "moneda": data.get("moneda") or "SOLES",
            "observacion": data.get("observacion")
            or "Generada automáticamente desde el Plan de Abastecimiento.",
        }

    # ── Navegación ───────────────────────────────────────────────

    def navegar_hasta_modulo(self, bot) -> bool:
        """Del menú principal hasta el formulario de órdenes de compra.

        # CONFIRMAR: el recorrido de menús real de NetComercial.
        """
        self._exigir_cerrojo_abierto()

        bot.click_coordenada("menu_logistica", raise_if_missing=True)
        bot.click_coordenada("submenu_ordenes_compra", raise_if_missing=True)
        bot.click_coordenada("submenu_registro", raise_if_missing=True)

        # Que la pantalla haya aparecido no se supone: se comprueba.
        if not bot.esperar_hasta_imagen("oc_formulario_abierto.png", timeout=25):
            bot.tomar_screenshot("error_no_abrio_formulario_oc")
            return False
        return True

    # ── El registro de UNA orden ─────────────────────────────────

    def registrar_registro(self, bot, data: dict[str, Any]) -> bool:
        """Registra una orden completa: cabecera + todas sus líneas + grabar.

        La unidad de trabajo es la orden ENTERA, no cada línea. Una orden
        con 12 de sus 31 líneas es basura que alguien tendría que ir a
        limpiar a mano dentro del ERP.
        """
        self._exigir_cerrojo_abierto()

        lineas = data["lineas"]
        if not lineas:
            raise ValueError(
                f"La orden de {data['proveedor_nombre']} no tiene ninguna línea "
                "con cantidad mayor que cero."
            )

        anotar = getattr(bot, "anotar", lambda *a, **k: None)
        anotar("oc:nueva", f"{data['proveedor_nombre']} — {len(lineas)} líneas")

        # ── Cabecera ──  # CONFIRMAR: orden real de los campos
        bot.click_coordenada("boton_nuevo", raise_if_missing=True)
        bot.pegar_texto(data["proveedor_codigo"])
        pyautogui.press("enter")

        if not self._proveedor_aceptado(bot, data):
            return False

        if data.get("fecha_entrega"):
            bot.escribir_en_campo("fecha_entrega", str(data["fecha_entrega"]))
        if data.get("condicion_pago"):
            bot.seleccionar_combo("condicion_pago", str(data["condicion_pago"]))
        bot.escribir_en_campo("observacion", data["observacion"][:200])

        # ── Detalle ──  # CONFIRMAR: cómo se agrega cada línea
        bot.click_coordenada("primera_celda_codigo", raise_if_missing=True)
        for i, linea in enumerate(lineas, start=1):
            anotar("oc:linea", f"{i}/{len(lineas)}  {linea['codigo']}  x{linea['cantidad']:g}")

            bot.pegar_texto(linea["codigo"]);          pyautogui.press("enter")
            bot.pegar_texto(f"{linea['cantidad']:g}"); pyautogui.press("enter")
            bot.pegar_texto(f"{linea['precio']:.4f}"); pyautogui.press("enter")

            if i < len(lineas):
                bot.click_coordenada("boton_agregar_linea", raise_if_missing=True)

        # ── Grabar ──  # CONFIRMAR: el diálogo de confirmación
        anotar("oc:grabar", f"Grabando la orden de {data['proveedor_nombre']}")
        bot.click_coordenada("boton_grabar", raise_if_missing=True)
        bot.pausa_con_mensaje("Esperando la confirmación del ERP", 2)

        if bot.verificar_pantalla("oc_confirmar_grabado.png", confianza=0.8):
            bot.click_coordenada("confirmacion_si")
            bot.pausa_con_mensaje("Confirmado", 2)

        return True

    def verificar_registro(self, bot, data: dict[str, Any]) -> bool:
        """No da la orden por buena hasta ver la señal de que se grabó.

        Este es el método que evita el fallo más caro de un bot de
        interfaz: pulsar Grabar, que salga un aviso inesperado, seguir
        adelante como si nada, y escribir las 20 órdenes siguientes encima
        de un formulario que ya no es el que el bot cree.
        """
        if not self.validar_pantalla("oc_grabada_ok.png", confianza=0.82):
            bot.tomar_screenshot(f"error_sin_confirmar_{data.get('proveedor_codigo', '')}")
            return False

        # El número de OC se guarda en la cola: es lo que permite enlazar
        # cada orden del plan con el documento real del ERP.
        numero = self._leer_numero_oc(bot)
        if numero:
            data["resultado"] = numero
            getattr(bot, "anotar", lambda *a, **k: None)("oc:grabada", f"Número {numero}")
        return True

    def limpiar_formulario(self, bot) -> bool:
        """Deja la pantalla lista para la orden siguiente."""
        try:
            bot.click_coordenada("boton_nuevo")
            bot.pausa_con_mensaje("Formulario limpio", 1)
        except Exception:  # noqa: BLE001 — un fallo aquí no invalida lo ya grabado
            return False
        return True

    # ── Apoyos ───────────────────────────────────────────────────

    def _proveedor_aceptado(self, bot, data: dict[str, Any]) -> bool:
        """Comprueba que el ERP reconoció el proveedor antes de seguir.

        Si el código no existe, NetComercial saca un aviso y deja el foco
        donde estaba. Sin esta comprobación, todo el detalle se escribiría
        encima del campo del proveedor.

        # CONFIRMAR: el aviso real que sale cuando el proveedor no existe.
        """
        if bot.verificar_pantalla("oc_proveedor_no_existe.png", confianza=0.8):
            bot.tomar_screenshot(f"error_proveedor_{data['proveedor_codigo']}")
            pyautogui.press("esc")
            raise ValueError(
                f"NetComercial no reconoce el proveedor "
                f"'{data['proveedor_codigo']}' ({data['proveedor_nombre']})."
            )
        return True

    def _leer_numero_oc(self, bot) -> str:
        """Copia al portapapeles el número de OC recién grabada.

        Por el portapapeles y no por OCR: el número tiene que ser exacto, y
        un OCR que confunde un 8 con un 3 no avisa de que se equivocó.

        # CONFIRMAR: si el campo del número permite seleccionar y copiar.
        """
        try:
            import pyperclip

            bot.click_coordenada("numero_oc")
            pyautogui.doubleClick()
            pyautogui.hotkey("ctrl", "c")
            bot.pausa_con_mensaje("Leyendo el número de OC", 0.6)
            return (pyperclip.paste() or "").strip()[:40]
        except Exception:  # noqa: BLE001 — sin número la orden sigue siendo válida
            return ""

    @staticmethod
    def _exigir_cerrojo_abierto() -> None:
        if not SECUENCIA_CONFIRMADA:
            raise SecuenciaSinConfirmar(
                "La secuencia de NetComercial todavía no está verificada.\n\n"
                "Los métodos marcados con «# CONFIRMAR» en "
                "bot_core/scripts/oc_netcomercial.py están escritos a partir de "
                "una suposición de cómo funciona el formulario, no de haberlo "
                "visto. Ejecutarlos contra el ERP de producción registraría "
                "documentos mal.\n\n"
                "Cuando la secuencia esté comprobada contra la pantalla real, "
                "pon SECUENCIA_CONFIRMADA = True en ese mismo archivo."
            )
