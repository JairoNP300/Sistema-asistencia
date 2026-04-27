# 🚀 QR-Asistencia - Sistema de Control de Personal

Sistema completo de control de asistencia con códigos QR dinámicos, seguridad criptográfica HMAC-SHA256 e integración Jibble para gestión avanzada de tiempo.

## 🌐 Acceso al Sistema

**URL de Producción:**
```
https://sistema-asistencia-s0m2.onrender.com
```

**Credenciales de Acceso:**
```
Usuario: admin
Contraseña: admin123
```

## ✨ Características Principales

- 📱 **Códigos QR Dinámicos**: Rotación automática cada 30 segundos con firma HMAC-SHA256
- 🔐 **Seguridad Avanzada**: Anti-replay, validación de tokens, bloqueo de intentos fallidos
- ☁️ **MongoDB Atlas**: Sincronización en la nube entre múltiples dispositivos
- ⏱️ **Timer/Kiosk**: Registro de tiempo trabajado con verificación de selfie, PIN y GPS
- 🏖️ **Time Off**: Gestión de ausencias y permisos con balance automático
- 👥 **Grupos y Proyectos**: Organización de empleados y seguimiento de proyectos
- 📊 **Reportes Avanzados**: Exportación CSV/XLS con filtros personalizados
- 🔄 **Auto-Deploy**: Sincronización automática con GitHub y Render

## 📦 Estructura del Proyecto

```
Sistema-asistencia-main/
├── models/              # Modelos MongoDB
│   ├── State.js        # Estado del sistema y empleados
│   ├── TimeEntry.js    # Registros de tiempo
│   ├── TimeOffRequest.js
│   ├── WorkSchedule.js
│   ├── Group.js
│   ├── Project.js
│   ├── Approval.js
│   └── Invoice.js
├── utils/              # Utilidades
│   ├── verifier.js     # Funciones de verificación
│   └── verifier.test.js # Tests
├── server.js           # Servidor Express principal
├── app.js              # Lógica del frontend
├── index.html          # Interfaz principal
├── watch-deploy.js     # Auto-deploy a GitHub
├── INICIAR_SISTEMA.bat # Inicio automático
└── DETENER_SISTEMA.bat # Detener sistema

```

## 🔧 Tecnologías

- **Backend**: Node.js + Express
- **Base de Datos**: MongoDB Atlas
- **Frontend**: Vanilla JavaScript + CSS
- **Seguridad**: HMAC-SHA256, JWT, bcrypt
- **Testing**: fast-check (property-based testing)
- **Deploy**: Render (auto-deploy desde GitHub)

## 🔄 Auto-Deploy

El sistema está configurado con auto-deploy en Render:

1. Haz cambios en el código
2. Haz commit y push a GitHub:
   ```bash
   git add .
   git commit -m "Descripción de cambios"
   git push origin main
   ```
3. Render detecta el push y redeploya automáticamente
4. Los cambios están en producción en ~2 minutos

**Alternativamente**, usa `watch-deploy.js` para auto-deploy automático:
```bash
node watch-deploy.js
```

Esto detecta cambios en archivos y los sube automáticamente a GitHub.

## 📚 Módulos Principales

### 1. Dashboard
Vista general con estadísticas en tiempo real, actividad reciente y empleados presentes.

### 2. Escáner QR
Escaneo de códigos QR con validación criptográfica y registro automático.

### 3. Generar QR
Generación de códigos QR dinámicos para estaciones de entrada/salida.

### 4. Empleados
Gestión completa de empleados con departamentos, roles y configuración de verificación.

### 5. Timer/Kiosk
Registro de tiempo trabajado con:
- Clock In/Clock Out
- Verificación de selfie (opcional)
- Validación de PIN (opcional)
- Geofencing GPS (opcional)
- Modo offline con sincronización

### 6. Time Off
Gestión de ausencias:
- Solicitudes de vacaciones, enfermedad, permisos
- Balance automático por tipo
- Aprobación por managers

### 7. Aprobaciones
Sistema de aprobación para:
- Timesheets
- Solicitudes de ausencia
- Horas extra

### 8. Horarios
Definición de horarios de trabajo asignables a empleados o grupos.

### 9. Grupos
Organización de empleados con permisos diferenciados.

### 10. Proyectos
Seguimiento de proyectos con:
- Código único
- Tarifa por hora
- Estado (activo/archivado)
- Facturación

### 11. Reportes Avanzados
Reportes personalizables con:
- Filtros por empleado, departamento, proyecto, fechas
- Exportación CSV/XLS
- Activity feed en tiempo real

### 12. Geofences
Definición de zonas geográficas permitidas para registro de asistencia.

## 🔒 Seguridad

- **HMAC-SHA256**: Firma criptográfica de tokens QR
- **Anti-Replay**: Prevención de reutilización de tokens
- **JWT**: Autenticación de sesiones
- **bcrypt**: Hash seguro de contraseñas y PINs
- **Geofencing**: Validación de ubicación GPS
- **Rate Limiting**: Bloqueo tras intentos fallidos

## 🌐 Deploy en Render (Auto-Deploy Activado)

El sistema está configurado para auto-deploy completo:

### Flujo de Deployment Automático:
```
Cambios Locales → Git Push → GitHub → Render (Auto-Deploy) → Producción
```

### Configuración Inicial en Render:

1. **Conectar Repositorio**
   - Ve a [Render Dashboard](https://dashboard.render.com/)
   - Click en "New +" → "Web Service"
   - Conecta tu repositorio: `https://github.com/JairoNP300/Sistema-asistencia`
   - Branch: `main`

2. **Configurar el Servicio**
   - Name: `qr-asistencia` (o el nombre que prefieras)
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free` (o el que prefieras)

3. **Variables de Entorno (CRÍTICO)**
   
   En la sección "Environment Variables", agrega:
   
   ```
   MONGODB_URI=mongodb+srv://Zetino19:JairoZetino22@cnad.zyac7wv.mongodb.net/qr_asistencia?retryWrites=true&w=majority&appName=CNAD
   JWT_SECRET=qr_asistencia_secret_key_production_2024
   DEFAULT_ADMIN_USERNAME=admin
   DEFAULT_ADMIN_PASSWORD=admin123
   NODE_ENV=production
   ```

4. **Activar Auto-Deploy**
   - En "Settings" → "Build & Deploy"
   - Asegúrate que "Auto-Deploy" esté en **Yes**
   - Esto hace que cada push a `main` redeploy automáticamente

### Uso del Sistema de Auto-Deploy Local:

El archivo `watch-deploy.js` detecta cambios y los sube automáticamente:

```bash
# Iniciar el sistema completo (incluye watch-deploy)
INICIAR_SISTEMA.bat

# O manualmente:
node watch-deploy.js
```

**Flujo Automático:**
1. Haces cambios en cualquier archivo
2. `watch-deploy.js` detecta el cambio
3. Automáticamente hace: `git add` → `git commit` → `git push`
4. GitHub recibe el push
5. Render detecta el push y redeploya automáticamente
6. En ~2 minutos, los cambios están en producción

### URL de Producción:

Una vez deployado, Render te dará una URL como:
```
https://qr-asistencia.onrender.com
```

O tu dominio personalizado si lo configuraste.

### Verificar Deployment:

1. **Logs en Render:**
   - Ve a tu servicio en Render Dashboard
   - Click en "Logs" para ver el deployment en tiempo real

2. **Estado del Servicio:**
   - El badge debe mostrar "Live" en verde
   - Si hay errores, revisa los logs

### Troubleshooting:

**Si el deployment falla:**
1. Verifica que todas las variables de entorno estén configuradas
2. Revisa los logs en Render Dashboard
3. Asegúrate que `MONGODB_URI` sea válido y accesible

**Si los cambios no se reflejan:**
1. Verifica que el push llegó a GitHub: `git log`
2. Verifica que Auto-Deploy esté activado en Render
3. Fuerza un redeploy manual desde Render Dashboard

**Si MongoDB no conecta:**
1. Verifica que la IP de Render esté en la whitelist de MongoDB Atlas
2. En MongoDB Atlas → Network Access → Add IP Address → "Allow Access from Anywhere" (0.0.0.0/0)

### Monitoreo:

- **Logs en tiempo real:** Render Dashboard → Logs
- **Métricas:** Render Dashboard → Metrics
- **Uptime:** Render mantiene el servicio activo 24/7

## 🐛 Solución de Problemas

### El servidor no inicia

1. Verifica que Node.js esté instalado: `node --version`
2. Verifica que las dependencias estén instaladas: `npm install`
3. Revisa el archivo `.env` para configuración correcta
4. Verifica que el puerto 3000 no esté en uso

### No se conecta a MongoDB

1. Verifica que `MONGODB_URI` esté correctamente configurado en `.env`
2. Verifica que tu IP esté en la whitelist de MongoDB Atlas
3. El sistema puede funcionar en modo local sin MongoDB

### Watch-deploy no funciona

1. Verifica que Git esté instalado: `git --version`
2. Verifica que el repositorio esté configurado: `git remote -v`
3. Verifica tus credenciales de Git

### Tests fallan

1. Verifica que fast-check esté instalado: `npm install`
2. Ejecuta los tests: `npm test`
3. Revisa los errores específicos en la salida

## 📄 Licencia

ISC

## 👨‍💻 Soporte

Para reportar problemas o solicitar características, contacta al administrador del sistema.

---

**Versión**: 2.0.0  
**Última actualización**: 2024
