import time


def countdown(segundos: int, mensaje="Preparando entorno"):
    """Cuenta regresiva en consola antes de iniciar."""
    if segundos < 0:
        segundos = 0
    try:
        print(f"  {mensaje}: espera {segundos} segundo(s)...", flush=True)
        for i in range(segundos, 0, -1):
            print(f"  Iniciando en {i}...", flush=True)
            time.sleep(1)
    except UnicodeEncodeError:
        print(f"  {mensaje}: {segundos}s...", flush=True)
        time.sleep(segundos)
