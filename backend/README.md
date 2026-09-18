# Backend de Abastecimiento

API de **solo lectura** sobre el ERP NetComercial. Consolida los requerimientos
de almacén por producto y los cruza con el stock y el histórico de compras para
responder a una sola pregunta: *qué hay que comprar hoy y cuánto.*

---

## Arranque rápido

```powershell
cd backend
.\iniciar.ps1                 # arranca el servidor
.\iniciar.ps1 -Recargar       # desarrollo: recarga al guardar
.\iniciar.ps1 -Verificar      # solo comprueba conexión y datos, y sale
```

| | |
|---|---|
| API | http://127.0.0.1:8100/api |
| Documentación interactiva | http://127.0.0.1:8100/docs |
| Estado de la conexión | http://127.0.0.1:8100/api/salud |

La primera vez, `iniciar.ps1` crea el entorno virtual e instala dependencias solo.

---

## Configuración

**Todo sale del archivo `.env` de la raíz del proyecto** (un nivel por encima de
esta carpeta). No hay nada hardcodeado y no hace falta crear variables de
entorno en el sistema: para desplegar en producción se copia ese archivo al
servidor y se ajustan los valores.

Las claves están documentadas en `.env.example`. Las que más se tocan:

| Clave | Para qué |
|---|---|
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión a SQL Server |
| `DB_DRIVER` | Driver ODBC instalado en la máquina |
| `DB_LINKED_SERVER` | Servidor vinculado hacia FoxPro (`FOX`) |
| `API_PORT` | Puerto del backend |
| `CORS_ORIGINS` | Desde qué URLs puede llamar el frontend |
| `CACHE_TTL_SEGUNDOS` | Cuánto se guarda un resultado antes de releerlo |

---

## Solo lectura: tres barreras

Este servicio **no puede escribir en la base de datos**, por diseño:

1. **Permisos.** El usuario de SQL Server es de lectura.
2. **Guardián por código** (`app/db.py`). Antes de enviar nada a la red, se
   analiza la sentencia: si no empieza por `SELECT`, o si contiene `INSERT`,
   `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `EXEC`, `INTO`… se rechaza con un
   403. Los comentarios se eliminan antes de analizar, para que no se pueda
   esconder una escritura detrás de un `--`.
3. **Sin transacciones.** La conexión va en `autocommit`, así nunca queda una
   transacción abierta que bloquee tablas del ERP mientras alguien lo usa.

Además, los valores que llegan de la pantalla (área, usuario, almacén, código de
producto) pasan por una **lista blanca** de caracteres antes de incrustarse en
la consulta remota. La consulta a FoxPro viaja como texto dentro de
`OPENQUERY`, así que no existen parámetros enlazados y escapar no basta.

`.\iniciar.ps1 -Verificar` comprueba estas barreras con nueve sentencias
peligrosas y confirma que todas se rechazan.

---

## De dónde salen los datos

No hay una base de datos, hay un puente. La verdad de compras y almacén vive en
**DBF de Visual FoxPro** en `192.168.1.250`; el proveedor OLE DB de FoxPro solo
existe en 32 bits, así que un backend moderno no puede abrirlos. Pero SQL Server
2008 R2 (que es una instancia de 32 bits) sí, y ya tiene configurado el servidor
vinculado `FOX`. Todo se lee así:

```sql
SELECT * FROM OPENQUERY(FOX, 'SELECT ... FROM detalle WHERE ...')
```

Documentos de NetComercial que usa este módulo:

| Código | Documento | Para qué se usa aquí |
|---|---|---|
| `058` | Requerimiento de almacén | Lo que piden las áreas — el consolidado |
| `009` | Salida interna | Lo que salió de almacén — mide lo atendido |
| `011` | Parte ingreso compra local | La compra real, con costo |
| `021` | Provisión de compras | *No se usa:* repite la cantidad de 011 con costo cero |

> El documento `007` (orden de compra) **no se usa en esta empresa**: existe en el
> catálogo pero no hay ni un solo documento. La compra real se registra como
> `011`, y por eso el histórico de compras se construye sobre él.

---

## Endpoints

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/api/salud` | Estado de la conexión y de la configuración |
| GET | `/api/catalogos` | Áreas, almacenes y usuarios para los filtros |
| GET | `/api/consolidado` | Requerimientos consolidados por producto |
| GET | `/api/consolidado/{codigo}/detalle` | Los requerimientos que suman ese total |
| GET | `/api/producto/{codigo}/historial` | Serie mensual de compras, consumo y demanda |
| POST | `/api/cache/limpiar` | Fuerza releer el ERP |

### Cómo se calcula cuánto comprar

```
ritmo mensual     = cantidad del histórico elegido / meses del periodo
necesidad         = ritmo mensual × meses de cobertura objetivo
cantidad a comprar = max(0, necesidad − stock disponible)
```

- **El histórico es elegible** (`base=compras|consumo|requerimientos`) porque no
  todas las fuentes merecen la misma confianza: las salidas de almacén dependen
  de que el almacenero las registre, mientras que los ingresos de compra están
  respaldados por una factura.
- **El pendiente no se suma por defecto**: la demanda del periodo ya está dentro
  del ritmo y contarla dos veces infla el pedido. Con `incluir_pendiente=true`
  se añade, para cubrir además el atraso acumulado.
- **Un saldo negativo se cuenta como cero.** Un stock negativo no es inventario,
  es un kardex descuadrado; tomarlo tal cual haría pedir cantidades absurdas (un
  servicio con saldo −152.000 pediría comprar 152.000 unidades). Se marca con
  `stock_negativo` para que quien compra sepa que ese dato no es de fiar.

---

## Rendimiento

Medido contra producción. La agregación se hace **siempre del lado de FoxPro**:
traer las filas para sumarlas en Python cuesta minutos, el mismo `SUM()`
embebido tarda segundos.

| Consulta | Tiempo |
|---|---|
| Consolidado de un año (4.137 productos, 80.371 líneas) | ~14 s |
| Atendido de un año | ~10 s |
| Maestro de productos (26.523 artículos) | ~4 s |
| Stock actual | ~0,7 s |
| **Consolidado completo del año (primera vez)** | **~40 s** |

Después, el resultado se sirve de caché durante `CACHE_TTL_SEGUNDOS` (15 min por
defecto) y la pantalla responde al instante. `POST /api/cache/limpiar` fuerza la
relectura.

---

## Trampas de FoxPro aprendidas aquí

Cosas que fallan de formas poco obvias, ya resueltas en el código:

- **`TOP n` exige `ORDER BY`** dentro de la consulta remota. Sin él:
  *"Cannot get the column information"*. Mejor aplicar `TOP` del lado de SQL Server.
- **Comparar un `char` con `= "1"`** puede dar *"Operator/operand type mismatch"*.
  Por eso `productos.estado` se filtra en Python, no en la cadena remota.
- **`YEAR()` dentro de `GROUP BY` falla.** El agrupado por mes se hace en Python.
- **La columna de septiembre es `sal_seti`, no `sal_sept`.** El stock vigente es
  `sal_actu`, no la columna del mes en curso.
- **`estado` es numérico en unas tablas y texto en otras**, según cómo se definió
  cada DBF. Hay que convertir antes de comparar.
- **Los `char(n)` vienen rellenos de espacios.** Sin recortar, `'PERNO   '` y
  `'PERNO'` son claves distintas y toda agrupación queda partida.
- **`campodel` y `docu_anul`**: FoxPro marca los borrados en vez de eliminarlos.
  Sin filtrarlos, todos los totales salen inflados.
- **`1899-12-30` es la fecha vacía de FoxPro**, no una fecha real.

---

## Estructura

```
backend/
├── app/
│   ├── config.py     Lee el .env de la raíz
│   ├── db.py         Conexión + guardián de solo lectura
│   ├── vfp.py        Constructor de consultas FoxPro + lista blanca
│   ├── queries.py    Consultas de dominio (agregan del lado de FoxPro)
│   ├── service.py    Lógica de negocio: consolidado, ritmo, proyección
│   ├── cache.py      Caché en memoria con vencimiento
│   ├── api.py        Endpoints HTTP
│   └── main.py       Aplicación FastAPI
├── verificar.py      Diagnóstico de punta a punta
├── iniciar.ps1       Lanzador
└── requirements.txt
```
