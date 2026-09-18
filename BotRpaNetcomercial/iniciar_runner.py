"""
Punto de entrada del programador del bot.

    python iniciar_runner.py            queda escuchando los horarios
    python iniciar_runner.py --ahora    corre una vez y sale
    python iniciar_runner.py --estado   consulta la cola sin tocar nada

La logica vive en bot_core/runner.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bot_core.runner import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
