"""
El aviso a pantalla completa antes de que el bot tome el control.

POR QUÉ EXISTE
--------------
Cuando el bot arranca se adueña del mouse y del teclado de la máquina.
Cualquier clic de una persona en ese momento cae dentro del formulario que
el bot está llenando — y como el bot no sabe que eso pasó, sigue adelante
escribiendo sobre una pantalla que ya no es la que cree.

Así que el bot no puede arrancar a traición. Avisa, cuenta hacia atrás, y
deja salida: quien esté trabajando pospone y sigue con lo suyo.

Está hecho con tkinter, que viene en la biblioteca estándar de Python: una
dependencia menos que instalar en la máquina donde corre el bot.
"""

from __future__ import annotations

import logging
import tkinter as tk
from typing import Literal

log = logging.getLogger("bot.aviso")

Decision = Literal["ahora", "posponer", "cancelar"]

# Los mismos tonos que la aplicación web, para que se reconozca de un vistazo.
_FONDO = "#0f172a"
_TINTA = "#f8fafc"
_TENUE = "#94a3b8"
_MARCA = "#2563eb"
_ALERTA = "#f59e0b"


def pedir_permiso(
    titulo: str,
    detalle: str,
    segundos: int = 60,
    minutos_posponer: int = 15,
) -> Decision:
    """Muestra la cuenta regresiva y devuelve qué decidió la persona.

    Si nadie toca nada, al llegar a cero devuelve "ahora": el caso normal
    es que no haya nadie delante de la pantalla.

    Args:
        titulo: qué va a hacer el bot, en una línea.
        detalle: el detalle — cuántas unidades, de qué lote.
        segundos: cuánto esperar antes de arrancar solo.
        minutos_posponer: cuánto se corre si eligen posponer.

    Returns:
        "ahora" | "posponer" | "cancelar"
    """
    if segundos <= 0:
        return "ahora"

    decision: Decision = "ahora"
    raiz = tk.Tk()
    raiz.title("El bot va a tomar el control")
    raiz.configure(bg=_FONDO)
    raiz.attributes("-fullscreen", True)
    raiz.attributes("-topmost", True)

    def resolver(valor: Decision) -> None:
        nonlocal decision
        decision = valor
        try:
            raiz.destroy()
        except tk.TclError:
            pass

    centro = tk.Frame(raiz, bg=_FONDO)
    centro.place(relx=0.5, rely=0.5, anchor="center")

    tk.Label(
        centro, text="EL BOT VA A TOMAR EL CONTROL DE ESTA COMPUTADORA",
        font=("Segoe UI", 15, "bold"), fg=_ALERTA, bg=_FONDO,
    ).pack(pady=(0, 18))

    tk.Label(centro, text=titulo, font=("Segoe UI", 26, "bold"),
             fg=_TINTA, bg=_FONDO, wraplength=1100, justify="center").pack()

    tk.Label(centro, text=detalle, font=("Segoe UI", 14), fg=_TENUE, bg=_FONDO,
             wraplength=1000, justify="center").pack(pady=(10, 26))

    reloj = tk.Label(centro, text=str(segundos), font=("Segoe UI", 76, "bold"),
                     fg=_MARCA, bg=_FONDO)
    reloj.pack()
    tk.Label(centro, text="segundos para que empiece", font=("Segoe UI", 12),
             fg=_TENUE, bg=_FONDO).pack(pady=(0, 30))

    botones = tk.Frame(centro, bg=_FONDO)
    botones.pack()

    def boton(texto: str, comando, color_fondo: str, color_texto: str) -> tk.Button:
        b = tk.Button(
            botones, text=texto, command=comando, font=("Segoe UI", 12, "bold"),
            bg=color_fondo, fg=color_texto, activebackground=color_fondo,
            activeforeground=color_texto, relief="flat", cursor="hand2",
            padx=26, pady=12, borderwidth=0,
        )
        b.pack(side="left", padx=7)
        return b

    boton(f"Posponer {minutos_posponer} minutos", lambda: resolver("posponer"), "#1e293b", _TINTA)
    boton("Empezar ahora", lambda: resolver("ahora"), _MARCA, "#ffffff")
    boton("Cancelar esta corrida", lambda: resolver("cancelar"), "#1e293b", "#fca5a5")

    tk.Label(
        centro,
        text="Mientras el bot trabaja no uses el mouse ni el teclado.  ·  "
             "Para detenerlo en cualquier momento, lleva el mouse a una esquina "
             "de la pantalla.",
        font=("Segoe UI", 11), fg=_TENUE, bg=_FONDO, wraplength=900, justify="center",
    ).pack(pady=(30, 0))

    # Atajos: Escape pospone (es el reflejo de cualquiera), Enter arranca.
    raiz.bind("<Escape>", lambda _e: resolver("posponer"))
    raiz.bind("<Return>", lambda _e: resolver("ahora"))

    restante = segundos

    def tic() -> None:
        nonlocal restante
        restante -= 1
        if restante <= 0:
            resolver("ahora")
            return
        try:
            reloj.config(text=str(restante), fg=_ALERTA if restante <= 10 else _MARCA)
            raiz.after(1000, tic)
        except tk.TclError:
            pass  # la ventana ya se cerró

    raiz.after(1000, tic)
    raiz.protocol("WM_DELETE_WINDOW", lambda: resolver("posponer"))

    try:
        raiz.mainloop()
    except Exception as e:  # noqa: BLE001
        # Un fallo de la interfaz gráfica no debe impedir una corrida
        # programada: sin pantalla que avisar, se arranca igual.
        log.warning("No se pudo mostrar el aviso (%s). Se continúa sin él.", e)
        return "ahora"

    log.info("Decisión del aviso: %s", decision)
    return decision


def avisar_fin(titulo: str, detalle: str, segundos: int = 8) -> None:
    """Un cartel breve al terminar, que se cierra solo. No pregunta nada."""
    try:
        raiz = tk.Tk()
        raiz.configure(bg=_FONDO)
        raiz.attributes("-topmost", True)
        raiz.overrideredirect(True)
        ancho, alto = 560, 170
        x = (raiz.winfo_screenwidth() - ancho) // 2
        raiz.geometry(f"{ancho}x{alto}+{x}+40")

        tk.Label(raiz, text=titulo, font=("Segoe UI", 16, "bold"),
                 fg=_TINTA, bg=_FONDO, wraplength=520).pack(pady=(26, 8))
        tk.Label(raiz, text=detalle, font=("Segoe UI", 11), fg=_TENUE,
                 bg=_FONDO, wraplength=520, justify="center").pack()
        tk.Label(raiz, text="Ya puedes usar la computadora con normalidad.",
                 font=("Segoe UI", 10), fg=_MARCA, bg=_FONDO).pack(pady=(12, 0))

        raiz.after(segundos * 1000, raiz.destroy)
        raiz.mainloop()
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo mostrar el aviso de fin: %s", e)
