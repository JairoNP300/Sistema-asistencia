# 🚀 Guía de Deployment - QR-Asistencia

## Sistema de Auto-Deploy Completo

Este sistema está configurado para deployment automático continuo:

```
Cambios Locales → GitHub → Render → Producción (en vivo)
```

---

## 📋 Configuración Inicial (Solo una vez)

### 1. Configurar Render

1. **Crear cuenta en Render**
   - Ve a https://render.com
   - Regístrate con tu cuenta de GitHub

2. **Crear nuevo Web Service**
   - Click en "New +" → "Web Service"
   - Selecciona tu repositorio: `JairoNP300/Sistema-asistencia`
   - Branch: `main`
   - Click "Connect"

3. **Configurar el servicio**
   ```
   Name: qr-asistencia
   Environment: Node
   Region: Oregon (US West) o el más cercano
   Branch: main
   Build Command: npm install
   Start Command: npm start
   ```

4. **Configurar Variables de Entorno**
   
   En la sección "Environment", agrega estas variables:
   
   ```
   MONGODB_URI=mongodb+srv://Zetino19:JairoZetino22@cnad.zyac7wv.mongodb.net/qr_asistencia?retryWrites=true&w=majority&appName=CNAD
   
   JWT_SECRET=qr_asistencia_secret_key_production_2024
   
   DEFAULT_ADMIN_USERNAME=admin
   
   DEFAULT_ADMIN_PASSWORD=admin123
   
   NODE_ENV=production
   ```

5. **Activar Auto-Deploy**
   - En "Settings" → "Build & Deploy"
   - Asegúrate que "Auto-Deploy" esté en **Yes**
   - Esto hace que cada push a GitHub redeploy automáticamente

6. **Configurar MongoDB Atlas**
   - Ve a MongoDB Atlas → Network Access
   - Click "Add IP Address"
   - Selecciona "Allow Access from Anywhere" (0.0.0.0/0)
   - Esto permite que Render se conecte a tu base de datos

7. **Deploy Inicial**
   - Click en "Create Web Service"
   - Espera 2-3 minutos mientras Render hace el primer deploy
   - Verás los logs en tiempo real

---

## 🔄 Uso Diario (Auto-Deploy)

### Opción 1: Con INICIAR_SISTEMA.bat (Recomendado)

```bash
# Ejecuta este archivo
INICIAR_SISTEMA.bat
```

Esto inicia:
- ✅ Servidor local en puerto 3000
- ✅ Watch-deploy (detecta cambios automáticamente)

**Flujo automático:**
1. Haces cambios en cualquier archivo
2. Guardas el archivo (Ctrl+S)
3. `watch-deploy.js` detecta el cambio en 3 segundos
4. Automáticamente hace: `git add` → `git commit` → `git push`
5. GitHub recibe el push
6. Render detecta el cambio y redeploya
7. En ~2 minutos, tus cambios están en producción

### Opción 2: Manual

```bash
# Hacer cambios en archivos
# Luego:

git add .
git commit -m "Descripción de cambios"
git push origin main

# Render detecta el push y redeploya automáticamente
```

---

## 🌐 Acceder al Sistema en Producción

### URL de Render

Después del primer deploy, Render te dará una URL como:

```
https://qr-asistencia-xxxx.onrender.com
```

O si configuraste un dominio personalizado:

```
https://tu-dominio.com
```

### Credenciales de Acceso

```
Usuario: admin
Contraseña: admin123
```

---

## 📊 Monitoreo y Logs

### Ver Logs en Tiempo Real

1. Ve a Render Dashboard
2. Click en tu servicio "qr-asistencia"
3. Click en "Logs"
4. Verás todos los logs del servidor en tiempo real

### Verificar Estado del Servicio

- **Badge verde "Live"**: Servicio funcionando correctamente
- **Badge amarillo "Building"**: Deployment en progreso
- **Badge rojo "Failed"**: Error en deployment (revisa logs)

### Métricas

En Render Dashboard → Metrics puedes ver:
- CPU usage
- Memory usage
- Request count
- Response times

---

## 🔧 Troubleshooting

### El deployment falla

**Síntomas:** Badge rojo "Failed" en Render

**Soluciones:**
1. Revisa los logs en Render Dashboard
2. Verifica que todas las variables de entorno estén configuradas
3. Asegúrate que `package.json` tenga todas las dependencias
4. Verifica que `Procfile` exista y tenga: `web: npm start`

### Los cambios no se reflejan en producción

**Síntomas:** Hiciste cambios pero la URL de Render muestra la versión antigua

**Soluciones:**
1. Verifica que el push llegó a GitHub:
   ```bash
   git log
   ```
2. Verifica que Auto-Deploy esté activado en Render
3. Fuerza un redeploy manual:
   - Render Dashboard → Manual Deploy → Deploy latest commit

### MongoDB no conecta

**Síntomas:** Error "MongoNetworkError" en logs

**Soluciones:**
1. Verifica que `MONGODB_URI` esté correctamente configurado en Render
2. En MongoDB Atlas → Network Access:
   - Asegúrate que "0.0.0.0/0" esté en la whitelist
3. Verifica que el usuario y password en la URI sean correctos

### Watch-deploy no funciona

**Síntomas:** Los cambios no se suben automáticamente a GitHub

**Soluciones:**
1. Verifica que Git esté instalado:
   ```bash
   git --version
   ```
2. Verifica que el repositorio esté configurado:
   ```bash
   git remote -v
   ```
3. Verifica tus credenciales de Git
4. Reinicia `watch-deploy.js`:
   ```bash
   node watch-deploy.js
   ```

### El servidor local no inicia

**Síntomas:** Error al ejecutar `INICIAR_SISTEMA.bat`

**Soluciones:**
1. Verifica que Node.js esté instalado:
   ```bash
   node --version
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Verifica que el puerto 3000 no esté en uso
4. Revisa el archivo `.env`

---

## 🎯 Mejores Prácticas

### 1. Siempre prueba localmente primero

```bash
# Inicia el servidor local
npm start

# Prueba en http://localhost:3000
# Si funciona bien, haz push a producción
```

### 2. Usa mensajes de commit descriptivos

```bash
# ❌ Mal
git commit -m "cambios"

# ✅ Bien
git commit -m "Agregado módulo de reportes avanzados con exportación XLS"
```

### 3. Monitorea los logs después de cada deploy

Después de hacer push, ve a Render Dashboard y verifica que el deployment sea exitoso.

### 4. Mantén las variables de entorno seguras

- Nunca hagas commit del archivo `.env`
- Usa valores diferentes para `JWT_SECRET` en producción
- Cambia las credenciales de admin por defecto

### 5. Haz backups de MongoDB

MongoDB Atlas hace backups automáticos, pero puedes hacer backups manuales:
- MongoDB Atlas → Clusters → Backup

---

## 📞 Soporte

Si tienes problemas:

1. Revisa esta guía completa
2. Revisa los logs en Render Dashboard
3. Verifica la configuración de variables de entorno
4. Contacta al administrador del sistema

---

## ✅ Checklist de Deployment

Usa este checklist para verificar que todo esté configurado:

- [ ] Cuenta de Render creada
- [ ] Web Service creado y conectado a GitHub
- [ ] Variables de entorno configuradas en Render
- [ ] Auto-Deploy activado en Render
- [ ] MongoDB Atlas configurado con IP 0.0.0.0/0
- [ ] Primer deployment exitoso (badge verde "Live")
- [ ] URL de producción accesible
- [ ] Login funciona con credenciales de admin
- [ ] `watch-deploy.js` funcionando localmente
- [ ] Cambios se reflejan automáticamente en producción

---

**¡Listo! Tu sistema está configurado para deployment automático continuo.**

Cualquier cambio que hagas se reflejará automáticamente en producción en ~2 minutos.
