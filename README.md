# Gestión de relacionamiento · Tickets

Aplicación web interna para analizar tickets, backlog y cumplimiento de SLA a partir del Data Warehouse de Finnegans GO. Incluye una vista ejecutiva, una vista de análisis detallado y un adaptador PostgreSQL de solo lectura.

Los indicadores, paneles y segmentos permiten abrir una exploración lateral paginada. Desde esa lista se puede expandir cada ticket para consultar sus fechas, estado, prioridad, empresa, equipo, responsable y situación de SLA.

La pantalla Resumen replica la estructura operativa del tablero original: situación de tickets arriba, organizaciones y estados a la izquierda, tipos y prioridades en el sector derecho, antigüedad debajo y filtros globales al pie.

## Inicio local

Requisitos: Node.js 22 o superior.

```bash
npm ci
copy .env.example .env.local
npm run dev:node
```

La configuración predeterminada usa datos de demostración y no requiere acceso al Warehouse. La aplicación queda disponible en `http://localhost:3000`.

## Conexión con Finnegans

1. Solicitar al administrador de Finnegans las credenciales PostgreSQL de solo lectura y autorizar la IP del servidor.
2. Crear `.env.local` a partir de `.env.example`.
3. Cambiar `DATA_SOURCE=postgres`, configurar `DATABASE_URL` y los certificados TLS.
4. Para el dataset relevado en este proyecto, configurar `TICKET_ADAPTER=finnegans_relationship` y `TICKETS_TABLE=public.fisterra_fisterra_gestion_relacionamiento_v2`. Dejar `TICKET_PROCESS` vacío para incluir todos los tickets o indicar un proceso concreto para limitar la consulta.

El adaptador toma `originacionnombre` como tipo de tarea, `organizacion` como cliente, `ultimaactividad` como estado y considera vencido un ticket abierto cuya `fechafintarea` ya pasó. Los cierres `FIN` y `DESCARTADA` usan `fechaultimaactividad`. Este mapeo debe reconciliarse contra la planilla de Power BI antes de publicar. Las credenciales solo se leen en el servidor.

## Endpoints

- `GET /api/dashboard/summary`: KPIs, tendencias y distribuciones.
- `GET /api/tickets`: detalle paginado y ordenado.
- `GET /api/filters`: valores disponibles para filtros.
- `GET /api/health`: verificación de vida del contenedor.

Los endpoints analíticos aceptan `from`, `to`, `status`, `priority`, `category`, `customer`, `team` y `assignee`. `/api/tickets` también acepta `page`, `pageSize`, `sort`, `direction`, `ticketId`, `ageBucket` y `scope`. Los alcances disponibles son `pending`, `overdue`, `inTime`, `created` y `resolved`.

## Validación

```bash
npm test
npm run build:node
npm run build
```

Antes de pasar a producción se deben reconciliar los KPIs contra la planilla exportada de Power BI para el total general y al menos cinco combinaciones de filtros.

## Despliegue en Vercel

El proyecto ya incluye `vercel.json` para instalar dependencias con `npm ci` y compilar la aplicación Next.js mediante `npm run build:node`. Al crear el proyecto en Vercel, importar el repositorio cuyo directorio raíz sea esta carpeta `dashboard` (o indicar `dashboard` como *Root Directory* si el repositorio contiene la carpeta padre).

Configurar en Vercel las mismas variables presentes en `.env.local`, como valores sensibles y solo para Production: `DATA_SOURCE`, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_SSL_CA` si corresponde, los límites de pool y tiempo de espera, y el adaptador/mapeo de tickets. No subir ni copiar `.env.local` al repositorio; `.vercelignore` lo excluye como defensa adicional.

Antes de desplegar con datos reales, Finnegans debe permitir la conectividad desde Vercel al Warehouse. Esto requiere IPs de salida estáticas autorizadas o conectividad privada, además de TLS y las credenciales de solo lectura. Los despliegues Preview no deben recibir credenciales de producción salvo que también tengan conectividad aprobada.

## Contenedor

```bash
docker build -t finnegans-ticket-analytics .
docker run --rm -p 3000:3000 --env-file .env.local finnegans-ticket-analytics
```

El contenedor no incluye autenticación propia. Debe publicarse únicamente dentro de la VPN o detrás del proxy interno de la organización. El proceso corre como usuario sin privilegios y expone el puerto `3000`.
