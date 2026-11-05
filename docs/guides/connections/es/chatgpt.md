# Conectar ChatGPT con Neotoma

ChatGPT accede a un servidor MCP de Neotoma por HTTPS autenticado. Un comando stdio local en tu ordenador no establece una conexión con ChatGPT.

Referencia publicada: v0.26.0 (`b6ae615`, 27 de octubre de 2026). La vía se examinó en el código `4779784` y en la documentación del proveedor el 24 de octubre de 2026; ese código está incluido en la versión publicada. La compatibilidad con la versión instalada del entorno y con Windows no se probó.

**Vía:** conector MCP remoto manual o Actions de un Custom GPT.

## Antes de conectar

El entorno guarda un conector remoto y puede obtener acceso al registro operado; la CLI y la base de datos permanecen donde se opera el endpoint. Lee [qué cambia en tu sistema](../../../topics/es/install/system-changes.md) antes de añadir el conector.

Usa el [selector de conexión para personas](https://neotoma.io/es/install/) para comparar vías compatibles. Utiliza un endpoint HTTPS `/mcp` de Neotoma ya operado, accesible y autenticado. ChatGPT no ejecuta tu CLI local de Neotoma, y conectarlo no inicializa un registro local. Comprueba los requisitos actuales de conectores y autenticación de tu cuenta; no guardes credenciales en archivos de proyecto compartidos.

## Configurar

ChatGPT no puede iniciar un proceso stdio de Neotoma en tu ordenador. Haz accesible por HTTPS el endpoint `/mcp` autenticado de Neotoma y añade esa URL mediante el flujo actual de conector o plugin MCP de ChatGPT, según las funciones disponibles en tu cuenta. Configura la autenticación dentro de ese flujo. Si creas un Custom GPT con Actions, usa en su lugar el esquema OpenAPI de Neotoma: Actions es una interfaz API distinta, no una conexión MCP. No existe una opción `neotoma setup --tool chatgpt`.

Verifica las herramientas MCP conectadas o, para Actions, la lista de operaciones importadas y una consulta de solo lectura. Una respuesta 401 apunta a credenciales o configuración OAuth; la ausencia de herramientas apunta al registro o descubrimiento del endpoint.

## Verificar y recuperar

Examina las herramientas conectadas y llama a `retrieve_entities` para una entidad conocida. En Custom GPT Actions, examina las operaciones importadas y haz una llamada API de solo lectura. Un 401 indica un problema de autenticación; una consulta vacía satisfactoria solo confirma el transporte. Una consulta vacía no demuestra que el perfil de datos esté vacío: comprueba un caso conocido que debe dar resultado.

## Fuentes

- [Guía MCP de Neotoma para ChatGPT](../../../developer/chatgpt_apps_setup.md)
- [Configuración de un servidor MCP personalizado en OpenAI](https://developers.openai.com/api/docs/guides/custom-mcp-server)
