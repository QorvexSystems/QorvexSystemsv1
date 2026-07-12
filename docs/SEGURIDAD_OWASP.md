# Seguridad OWASP aplicada

Este proyecto usa una primera capa de endurecimiento basada en recomendaciones OWASP para una plataforma interna.

## Acceso interno

`INTERNAL_ALLOWED_IPS` permite limitar el acceso al web y al API por IP publica o rango CIDR.

Ejemplo:

```env
INTERNAL_ALLOWED_IPS="203.0.113.10,198.51.100.0/24"
```

Si la variable esta vacia, no se aplica restriccion por IP. Esto mantiene comodo el desarrollo local.

## API

- Helmet habilita cabeceras HTTP defensivas.
- `X-Robots-Tag: noindex, nofollow` evita indexacion accidental.
- Rate limit global reduce abuso general del API.
- Rate limit especifico para `/auth/login` reduce fuerza bruta de credenciales.
- CORS solo acepta los origenes configurados en `CORS_ORIGIN`.
- El body parser tiene limites configurables con `API_JSON_BODY_LIMIT` y `API_FORM_BODY_LIMIT`.
- Importaciones aceptan solo `.xlsx`, con limite de 10 MB.

## Web

- `poweredByHeader` esta desactivado.
- Se aplica CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y `X-Robots-Tag`.
- `/robots.txt` bloquea indexacion.
- El middleware valida `INTERNAL_ALLOWED_IPS` antes de resolver login o rutas protegidas.

## Produccion

Para un cierre mas fuerte que una validacion a nivel de aplicacion, combinar esto con una de estas opciones:

- Vercel Firewall con allowlist de IPs.
- VPN corporativa y permitir solo la salida publica de esa VPN.
- Cloudflare Access, Tailscale, Zero Trust o una capa similar delante de Vercel.
