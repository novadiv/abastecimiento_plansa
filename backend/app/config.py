"""
Configuración centralizada.

TODO valor configurable sale del archivo `.env` de la RAÍZ del proyecto
(un nivel por encima de `backend/`). No hay nada hardcodeado: para mover
el sistema a otro servidor basta con copiar y editar ese `.env`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> raíz del proyecto
RAIZ_PROYECTO = Path(__file__).resolve().parent.parent.parent
ARCHIVO_ENV = RAIZ_PROYECTO / ".env"


class Settings(BaseSettings):
    """Valores leídos de `.env`. Los nombres coinciden con las claves del archivo."""

    model_config = SettingsConfigDict(
        env_file=ARCHIVO_ENV,
        env_file_encoding="utf-8",
        extra="ignore",  # el .env también trae variables VITE_* del frontend
        case_sensitive=False,
    )

    # ── Base de datos (SOLO LECTURA) ──────────────────────────────────
    db_host: str = "192.168.1.250"
    db_port: int = 1433
    db_name: str = "PlaproduccionBD"
    db_user: str = ""
    db_password: str = ""
    db_driver: str = "ODBC Driver 11 for SQL Server"
    db_linked_server: str = "FOX"
    db_query_timeout: int = 300
    db_connect_timeout: int = 15
    db_solo_lectura: bool = True

    # ── Servidor ──────────────────────────────────────────────────────
    api_host: str = "127.0.0.1"
    api_port: int = 8100
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cache_ttl_segundos: int = 900

    # ── Bot RPA ───────────────────────────────────────────────────────
    # La cola del bot vive en SQLite, en una base APARTE de la del ERP.
    # Nada de esto afecta a la garantía de solo lectura sobre NetComercial:
    # el bot escribe en el ERP por la interfaz, como lo haría una persona.
    bot_db_ruta: str = "datos/bot.sqlite3"
    bot_token: str = ""              # secreto compartido con el proceso del bot
    bot_capturas_dir: str = "BotRpaNetcomercial/screenshots"
    bot_latido_minutos: int = 15     # sin señales por más de esto, la corrida se da por muerta
    bot_max_items_corrida: int = 40  # tope de seguridad por corrida

    # ── Dominio ───────────────────────────────────────────────────────
    empresa_id: str = "001"
    cobertura_meses_defecto: int = 2
    dias_en_camino: int = 90

    @property
    def lista_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cadena_conexion(self) -> str:
        """Cadena ODBC. `ReadOnly` es declarativo; la garantía real la da
        el permiso del usuario en SQL Server y el guardián de `db.py`."""
        return (
            f"DRIVER={{{self.db_driver}}};"
            f"SERVER={self.db_host},{self.db_port};"
            f"DATABASE={self.db_name};"
            f"UID={self.db_user};"
            f"PWD={self.db_password};"
            f"Timeout={self.db_connect_timeout};"
        )

    def resumen_seguro(self) -> dict[str, object]:
        """Diagnóstico para /api/salud — nunca expone la contraseña."""
        return {
            "servidor": f"{self.db_host}:{self.db_port}",
            "base_datos": self.db_name,
            "usuario": self.db_user,
            "driver": self.db_driver,
            "servidor_vinculado": self.db_linked_server,
            "solo_lectura": self.db_solo_lectura,
            "archivo_env": str(ARCHIVO_ENV),
            "env_encontrado": ARCHIVO_ENV.exists(),
            "bot_db": self.bot_db_ruta,
            "bot_token_definido": bool(self.bot_token),
        }

    @property
    def ruta_capturas_bot(self) -> Path:
        """Carpeta de donde se sirven las capturas de error del bot."""
        ruta = Path(self.bot_capturas_dir)
        return ruta if ruta.is_absolute() else RAIZ_PROYECTO / ruta


@lru_cache
def get_settings() -> Settings:
    return Settings()
