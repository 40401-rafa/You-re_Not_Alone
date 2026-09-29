/**
 * VOCÊ NÃO ESTÁ SOZINHO - Motor Gráfico WebGL 3D & Arquitetura da Casa (world.js)
 * Desenvolvido em Vanilla JavaScript + WebGL nativo.
 * Gera proceduralmente texturas atmosféricas, geometria da casa, móveis 3D, iluminação dinâmica e colisões.
 */

window.GameWorld = (function() {
  'use strict';

  let gl = null;
  let canvas = null;
  let fxCanvas = null;
  let fxCtx = null;
  let shaderProgram = null;

  // Variáveis uniformes WebGL
  let uMatrixLoc, uNormalMatrixLoc, uModelMatrixLoc;
  let uFlashlightPosLoc, uFlashlightDirLoc, uFlashlightParamsLoc;
  let uAmbientLightLoc, uFogColorLoc, uFogParamsLoc;
  let uPointLightPosLoc, uPointLightColorLoc, uPointLightParamsLoc;
  let uSamplerLoc, uTimeLoc;

  let vertexBuffer = null;
  let uvBuffer = null;
  let normalBuffer = null;
  let textureAtlas = null;

  // Geometria e Objetos do Mundo
  let worldMeshes = [];
  let doors = {};
  let interactiveObjects = [];
  let collisionBoxes = [];
  let pointLights = [];

  // Pós-processamento VHS e Partículas
  let dustParticles = [];
  const MAX_DUST = 70;

  // =========================================================================
  // MATRIZES E MATEMÁTICA 3D NATIVA
  // =========================================================================
  const Mat4 = {
    identity: function() {
      return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ]);
    },
    multiply: function(a, b) {
      const out = new Float32Array(16);
      for (let i = 0; i < 4; i++) {
        const ai0 = a[i], ai1 = a[i+4], ai2 = a[i+8], ai3 = a[i+12];
        out[i]    = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
        out[i+4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
        out[i+8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[13];
        out[i+12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
      }
      return out;
    },
    perspective: function(fovy, aspect, near, far) {
      const f = 1.0 / Math.tan(fovy / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, (2 * far * near) * nf, 0
      ]);
    },
    lookAt: function(eye, target, up) {
      let z0 = eye[0] - target[0], z1 = eye[1] - target[1], z2 = eye[2] - target[2];
      let len = 1 / Math.hypot(z0, z1, z2);
      z0 *= len; z1 *= len; z2 *= len;

      let x0 = up[1] * z2 - up[2] * z1;
      let x1 = up[2] * z0 - up[0] * z2;
      let x2 = up[0] * z1 - up[1] * z0;
      len = 1 / Math.hypot(x0, x1, x2);
      x0 *= len; x1 *= len; x2 *= len;

      const y0 = z1 * x2 - z2 * x1;
      const y1 = z2 * x0 - z0 * x2;
      const y2 = z0 * x1 - z1 * x0;

      return new Float32Array([
        x0, y0, z0, 0,
        x1, y1, z1, 0,
        x2, y2, z2, 0,
        -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
        -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
        -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
        1
      ]);
    },
    translate: function(m, v) {
      const out = new Float32Array(m);
      out[12] = m[0] * v[0] + m[4] * v[1] + m[8]  * v[2] + m[12];
      out[13] = m[1] * v[0] + m[5] * v[1] + m[9]  * v[2] + m[13];
      out[14] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
      out[15] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
      return out;
    },
    rotateY: function(m, rad) {
      const s = Math.sin(rad), c = Math.cos(rad);
      const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
      const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
      const out = new Float32Array(m);
      out[0] = a00 * c - a20 * s;
      out[1] = a01 * c - a21 * s;
      out[2] = a02 * c - a22 * s;
      out[3] = a03 * c - a23 * s;
      out[8] = a00 * s + a20 * c;
      out[9] = a01 * s + a21 * c;
      out[10] = a02 * s + a22 * c;
      out[11] = a03 * s + a23 * c;
      return out;
    }
  };

  // =========================================================================
  // SHADERS WEBGL (ILUMINAÇÃO DE LANTERNA, PONTOS DE LUZ E NEVOEIRO)
  // =========================================================================
  const vsSource = `
    attribute vec3 a_position;
    attribute vec2 a_uv;
    attribute vec3 a_normal;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_worldPos;
    varying vec2 v_uv;
    varying vec3 v_normal;

    void main() {
      vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
      v_worldPos = worldPos.xyz;
      v_normal = normalize((u_modelMatrix * vec4(a_normal, 0.0)).xyz);
      v_uv = a_uv;
      gl_Position = u_matrix * vec4(a_position, 1.0);
    }
  `;

  const fsSource = `
    precision mediump float;

    varying vec3 v_worldPos;
    varying vec2 v_uv;
    varying vec3 v_normal;

    uniform sampler2D u_sampler;
    uniform vec3 u_flashlightPos;
    uniform vec3 u_flashlightDir;
    // x: cutOff cos, y: outerCutOff cos, z: intensity, w: active (0 or 1)
    uniform vec4 u_flashlightParams;

    uniform vec3 u_ambientLight;
    uniform vec3 u_fogColor;
    // x: fogNear, y: fogFar, z: fogDensity
    uniform vec3 u_fogParams;

    // Até 6 pontos de luz (x, y, z)
    uniform vec3 u_pointLightPos[6];
    uniform vec3 u_pointLightColor[6];
    // x: intensity, y: radius, z: enabled
    uniform vec3 u_pointLightParams[6];

    void main() {
      vec4 texColor = texture2D(u_sampler, v_uv);
      if (texColor.a < 0.1) discard;

      vec3 norm = normalize(v_normal);
      vec3 totalLight = u_ambientLight;

      // 1. Lanterna (Cone amplo com centro iluminado e bordas suaves)
      if (u_flashlightParams.w > 0.5) {
        vec3 lightToFrag = v_worldPos - u_flashlightPos;
        float dist = length(lightToFrag);
        vec3 lightDir = normalize(-lightToFrag);

        float theta = dot(lightDir, normalize(-u_flashlightDir));
        float inner = u_flashlightParams.x;
        float outer = u_flashlightParams.y;
        float epsilon = inner - outer;
        float spotFactor = clamp((theta - outer) / max(epsilon, 0.001), 0.0, 1.0);

        // Atenuação suave com alcance real (18m)
        float att = 1.0 / (1.0 + 0.035 * dist + 0.005 * dist * dist);
        float diff = max(dot(norm, lightDir), 0.0);

        vec3 flashColor = vec3(1.0, 0.98, 0.94) * u_flashlightParams.z;
        // Centro bem nítido + preenchimento suave ao redor
        totalLight += flashColor * (diff * 1.6 + 0.40) * spotFactor * att;
      }

      // 2. Pontos de luz ambiente (Lâmpadas dos cômodos, TV, abajures)
      for (int i = 0; i < 6; i++) {
        if (u_pointLightParams[i].z > 0.5) {
          vec3 lightToPos = u_pointLightPos[i] - v_worldPos;
          float dist = length(lightToPos);
          float radius = u_pointLightParams[i].y;

          if (dist < radius) {
            vec3 lightDir = normalize(lightToPos);
            float diff = max(dot(norm, lightDir), 0.0);
            float att = clamp(1.0 - (dist / radius), 0.0, 1.0);
            att = att * att;
            totalLight += u_pointLightColor[i] * (u_pointLightParams[i].x * (diff * 1.3 + 0.25)) * att;
          }
        }
      }

      vec3 litColor = texColor.rgb * totalLight;

      // 3. Nevoeiro suave a distância (mantém cômodos visíveis)
      float distToCam = length(v_worldPos - u_flashlightPos);
      float fogFactor = clamp((distToCam - u_fogParams.x) / (u_fogParams.y - u_fogParams.x), 0.0, 1.0);
      fogFactor = pow(fogFactor, 2.2);

      vec3 finalColor = mix(litColor, u_fogColor, fogFactor);
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `;

  // =========================================================================
  // GERAÇÃO DE TEXTURAS PROCEDURAIS VIA 2D CANVAS (SEM DEPENDÊNCIA EXTERNA)
  // =========================================================================
  function createTextureAtlas() {
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = 1024;
    atlasCanvas.height = 1024;
    const ctx = atlasCanvas.getContext('2d');

    // Divide atlas em grade 4x4 (256x256 cada)
    const T_SIZE = 256;

    // Helper de preenchimento
    function getTileCoords(col, row) {
      return { x: col * T_SIZE, y: row * T_SIZE, s: T_SIZE };
    }

    // 1. [0, 0] Assoalho de Madeira com Placas Visíveis
    {
      const t = getTileCoords(0, 0);
      ctx.fillStyle = '#3a2d24';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      const plankHeight = 32;
      for (let y = 0; y < t.s; y += plankHeight) {
        ctx.strokeStyle = '#221914';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + y);
        ctx.lineTo(t.x + t.s, t.y + y);
        ctx.stroke();

        // Linhas de veio da madeira e pregos
        ctx.fillStyle = (y / plankHeight) % 2 === 0 ? '#48392e' : '#413227';
        ctx.fillRect(t.x, t.y + y + 2, t.s, plankHeight - 4);

        for (let x = 16; x < t.s; x += 64) {
          ctx.fillStyle = '#1c130d';
          ctx.beginPath();
          ctx.arc(t.x + x + (y % 4) * 8, t.y + y + 8, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 2. [1, 0] Papel de Parede Vitoriano com Textura Nítida (Quarto / Sala)
    {
      const t = getTileCoords(1, 0);
      ctx.fillStyle = '#453232';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      // Padrão de arabesco escuro
      ctx.strokeStyle = '#5a4242';
      ctx.lineWidth = 3;
      for (let x = 0; x < t.s; x += 32) {
        for (let y = 0; y < t.s; y += 32) {
          ctx.strokeRect(t.x + x + 4, t.y + y + 4, 24, 24);
          ctx.beginPath();
          ctx.arc(t.x + x + 16, t.y + y + 16, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Manchas de desgaste sutis
      const grad = ctx.createRadialGradient(t.x + 80, t.y + 120, 10, t.x + 80, t.y + 120, 80);
      grad.addColorStop(0, 'rgba(30, 20, 20, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(t.x, t.y, t.s, t.s);
    }

    // 3. [2, 0] Teto Gessado com Infiltrações Visíveis
    {
      const t = getTileCoords(2, 0);
      ctx.fillStyle = '#44474e';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      // Rachaduras no teto
      ctx.strokeStyle = '#2b2d33';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x + 40, t.y);
      ctx.lineTo(t.x + 90, t.y + 60);
      ctx.lineTo(t.x + 130, t.y + 80);
      ctx.lineTo(t.x + 180, t.y + 160);
      ctx.stroke();

      ctx.fillStyle = '#36383e';
      ctx.beginPath();
      ctx.arc(t.x + 128, t.y + 128, 45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. [3, 0] Azulejos Nítidos do Banheiro (Ciano / Rejunte)
    {
      const t = getTileCoords(3, 0);
      ctx.fillStyle = '#22383c';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      const tileSize = 32;
      for (let x = 0; x < t.s; x += tileSize) {
        for (let y = 0; y < t.s; y += tileSize) {
          ctx.fillStyle = (x + y) % 64 === 0 ? '#325055' : '#2b464a';
          ctx.fillRect(t.x + x + 1, t.y + y + 1, tileSize - 2, tileSize - 2);

          // Rejunte nítido
          ctx.strokeStyle = '#152528';
          ctx.lineWidth = 1;
          ctx.strokeRect(t.x + x, t.y + y, tileSize, tileSize);
        }
      }
    }

    // 5. [0, 1] Porta de Madeira com Painéis e Fechadura de Latão
    {
      const t = getTileCoords(0, 1);
      ctx.fillStyle = '#38281d';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      // Moldura e painéis da porta
      ctx.strokeStyle = '#22160e';
      ctx.lineWidth = 6;
      ctx.strokeRect(t.x + 16, t.y + 16, t.s - 32, t.s - 32);

      // Painel superior
      ctx.fillStyle = '#483426';
      ctx.fillRect(t.x + 28, t.y + 28, t.s - 56, 90);
      ctx.strokeStyle = '#261a12';
      ctx.strokeRect(t.x + 28, t.y + 28, t.s - 56, 90);

      // Painel inferior
      ctx.fillRect(t.x + 28, t.y + 138, t.s - 56, 90);
      ctx.strokeRect(t.x + 28, t.y + 138, t.s - 56, 90);

      // Fechadura de latão bem visível
      ctx.fillStyle = '#c2a559';
      ctx.fillRect(t.x + t.s - 42, t.y + 120, 12, 22);
      ctx.fillStyle = '#1c1308';
      ctx.beginPath();
      ctx.arc(t.x + t.s - 36, t.y + 127, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. [1, 1] Retrato da Família Sinistro
    {
      const t = getTileCoords(1, 1);
      ctx.fillStyle = '#3a2e1d';
      ctx.fillRect(t.x, t.y, t.s, t.s); // Moldura dourada

      ctx.fillStyle = '#181412';
      ctx.fillRect(t.x + 16, t.y + 16, t.s - 32, t.s - 32);

      // Silhuetas de rostos fantasmagóricos na pintura
      ctx.fillStyle = '#4a423d';
      ctx.beginPath();
      ctx.arc(t.x + 100, t.y + 100, 30, 0, Math.PI * 2);
      ctx.arc(t.x + 160, t.y + 105, 26, 0, Math.PI * 2);
      ctx.fill();

      // Olhos brancos inquietantes
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(t.x + 92, t.y + 95, 3, 3);
      ctx.fillRect(t.x + 105, t.y + 95, 3, 3);
      ctx.fillRect(t.x + 154, t.y + 102, 3, 3);
      ctx.fillRect(t.x + 166, t.y + 102, 3, 3);
    }

    // 7. [2, 1] Mensagem de Terror na Parede ("NÃO OLHE PARA TRÁS")
    {
      const t = getTileCoords(2, 1);
      ctx.fillStyle = '#221c1a';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#8f1c1c';
      ctx.fillText('NÃO OLHE', t.x + 45, t.y + 110);
      ctx.fillText('PARA TRÁS.', t.x + 35, t.y + 150);

      // Sangue/ranhuras escorrendo
      ctx.strokeStyle = '#631010';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x + 85, t.y + 155);
      ctx.lineTo(t.x + 85, t.y + 210);
      ctx.moveTo(t.x + 145, t.y + 155);
      ctx.lineTo(t.x + 145, t.y + 195);
      ctx.stroke();
    }

    // 8. [3, 1] Tela de TV Antiga / Estática
    {
      const t = getTileCoords(3, 1);
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      // Ruído estático preto e branco
      for (let x = 0; x < t.s; x += 4) {
        for (let y = 0; y < t.s; y += 4) {
          const lum = Math.floor(Math.random() * 120 + 20);
          ctx.fillStyle = `rgb(${lum},${lum + 10},${lum + 30})`;
          ctx.fillRect(t.x + x, t.y + y, 4, 4);
        }
      }
    }

    // 9. [0, 2] Textura de Móveis de Madeira (Mesas, Cômodas, Armários)
    {
      const t = getTileCoords(0, 2);
      ctx.fillStyle = '#302217';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      ctx.fillStyle = '#241910';
      for (let y = 0; y < t.s; y += 16) {
        ctx.fillRect(t.x, t.y + y, t.s, 2);
      }
      // Gavetas
      ctx.strokeStyle = '#18100a';
      ctx.lineWidth = 4;
      ctx.strokeRect(t.x + 10, t.y + 20, t.s - 20, 60);
      ctx.strokeRect(t.x + 10, t.y + 100, t.s - 20, 60);
      ctx.strokeRect(t.x + 10, t.y + 180, t.s - 20, 60);
    }

    // 10. [1, 2] O Observador - Silhueta Sombria e Espectral
    {
      const t = getTileCoords(1, 2);
      ctx.clearRect(t.x, t.y, t.s, t.s);

      // Fumaça negra e corpo espectral
      const grad = ctx.createRadialGradient(t.x + 128, t.y + 110, 20, t.x + 128, t.y + 130, 110);
      grad.addColorStop(0, 'rgba(8, 8, 10, 0.98)');
      grad.addColorStop(0.7, 'rgba(4, 4, 6, 0.7)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(t.x + 128, t.y + 140, 48, 100, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cabeça alongada
      ctx.beginPath();
      ctx.ellipse(t.x + 128, t.y + 60, 26, 36, 0, 0, Math.PI * 2);
      ctx.fill();

      // Olhos pálidos brilhantes inquietantes
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.fillRect(t.x + 118, t.y + 56, 4, 4);
      ctx.fillRect(t.x + 134, t.y + 56, 4, 4);
      ctx.shadowBlur = 0;
    }

    // 11. [2, 2] Piso da Cozinha (Xadrez Gasto)
    {
      const t = getTileCoords(2, 2);
      const cSize = 32;
      for (let x = 0; x < t.s; x += cSize) {
        for (let y = 0; y < t.s; y += cSize) {
          ctx.fillStyle = (x / cSize + y / cSize) % 2 === 0 ? '#443b35' : '#1c1917';
          ctx.fillRect(t.x + x, t.y + y, cSize, cSize);
        }
      }
    }

    // 12. [3, 2] Tecido do Sofá Velho
    {
      const t = getTileCoords(3, 2);
      ctx.fillStyle = '#2c2730';
      ctx.fillRect(t.x, t.y, t.s, t.s);

      ctx.strokeStyle = '#1e1a22';
      ctx.lineWidth = 2;
      for (let i = 0; i < t.s; i += 16) {
        ctx.beginPath();
        ctx.moveTo(t.x + i, t.y);
        ctx.lineTo(t.x + i, t.y + t.s);
        ctx.stroke();
      }
    }

    return atlasCanvas;
  }

  // =========================================================================
  // SISTEMA DE ATLAS UV (Retorna [u0, v0, u1, v1] normalizados)
  // =========================================================================
  const AtlasUV = {
    WOOD_FLOOR:    [0/4, 0/4, 1/4, 1/4],
    WALLPAPER:     [1/4, 0/4, 2/4, 1/4],
    CEILING:       [2/4, 0/4, 3/4, 1/4],
    BATH_TILE:     [3/4, 0/4, 4/4, 1/4],
    DOOR:          [0/4, 1/4, 1/4, 2/4],
    PORTRAIT:      [1/4, 1/4, 2/4, 2/4],
    WALL_TEXT:     [2/4, 1/4, 3/4, 2/4],
    TV_SCREEN:     [3/4, 1/4, 4/4, 2/4],
    FURNITURE:     [0/4, 2/4, 1/4, 3/4],
    OBSERVER:      [1/4, 2/4, 2/4, 3/4],
    KITCHEN_TILE:  [2/4, 2/4, 3/4, 3/4],
    SOFA_FABRIC:   [3/4, 2/4, 4/4, 3/4]
  };

  // =========================================================================
  // INICIALIZAÇÃO WEBGL
  // =========================================================================
  function init() {
    canvas = document.getElementById('render-canvas');
    fxCanvas = document.getElementById('fx-canvas');

    if (!canvas) {
      console.error('Canvas #render-canvas não encontrado!');
      return false;
    }

    resize();
    window.addEventListener('resize', resize);

    gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) {
      console.error('WebGL não suportado pelo navegador!');
      return false;
    }

    if (fxCanvas) {
      fxCtx = fxCanvas.getContext('2d');
    }

    // Configurações WebGL
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Compilação dos Shaders
    const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vs);
    gl.attachShader(shaderProgram, fs);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Erro ao compilar Shaders:', gl.getProgramInfoLog(shaderProgram));
      return false;
    }

    gl.useProgram(shaderProgram);

    // Uniformes
    uMatrixLoc = gl.getUniformLocation(shaderProgram, 'u_matrix');
    uModelMatrixLoc = gl.getUniformLocation(shaderProgram, 'u_modelMatrix');
    uFlashlightPosLoc = gl.getUniformLocation(shaderProgram, 'u_flashlightPos');
    uFlashlightDirLoc = gl.getUniformLocation(shaderProgram, 'u_flashlightDir');
    uFlashlightParamsLoc = gl.getUniformLocation(shaderProgram, 'u_flashlightParams');
    uAmbientLightLoc = gl.getUniformLocation(shaderProgram, 'u_ambientLight');
    uFogColorLoc = gl.getUniformLocation(shaderProgram, 'u_fogColor');
    uFogParamsLoc = gl.getUniformLocation(shaderProgram, 'u_fogParams');

    for (let i = 0; i < 6; i++) {
      pointLights.push({
        posLoc: gl.getUniformLocation(shaderProgram, `u_pointLightPos[${i}]`),
        colLoc: gl.getUniformLocation(shaderProgram, `u_pointLightColor[${i}]`),
        paramLoc: gl.getUniformLocation(shaderProgram, `u_pointLightParams[${i}]`),
        x: 0, y: 0, z: 0,
        r: 1, g: 1, b: 1,
        intensity: 0, radius: 0, enabled: 0
      });
    }

    // Carrega Atlas de Texturas
    const atlasCanvas = createTextureAtlas();
    textureAtlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textureAtlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);

    // Constrói o mapa da casa
    buildHouse();
    initDust();

    return true;
  }

  function resize() {
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    if (fxCanvas) {
      fxCanvas.width = w;
      fxCanvas.height = h;
    }

    if (gl) {
      gl.viewport(0, 0, w, h);
    }
  }

  function compileShader(gl, src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Falha Shader:', gl.getShaderInfoLog(s));
    }
    return s;
  }

  // =========================================================================
  // CONSTRUTOR DE GEOMETRIA (QUADS, CUBOS, PORTAS E MÓVEIS)
  // =========================================================================
  const builder = {
    positions: [],
    uvs: [],
    normals: [],

    addQuad: function(p0, p1, p2, p3, uv, norm) {
      // Dois triângulos por quad (sentido anti-horário)
      this.positions.push(
        p0[0], p0[1], p0[2],
        p1[0], p1[1], p1[2],
        p2[0], p2[1], p2[2],
        p0[0], p0[1], p0[2],
        p2[0], p2[1], p2[2],
        p3[0], p3[1], p3[2]
      );

      const u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
      this.uvs.push(
        u0, v1,
        u1, v1,
        u1, v0,
        u0, v1,
        u1, v0,
        u0, v0
      );

      for (let i = 0; i < 6; i++) {
        this.normals.push(norm[0], norm[1], norm[2]);
      }
    },

    addBox: function(x, y, z, w, h, d, uvMap) {
      const hw = w / 2, hd = d / 2;
      const x0 = x - hw, x1 = x + hw;
      const y0 = y, y1 = y + h;
      const z0 = z - hd, z1 = z + hd;

      const uv = uvMap || AtlasUV.FURNITURE;

      // Frente (+Z)
      this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv, [0, 0, 1]);
      // Trás (-Z)
      this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv, [0, 0, -1]);
      // Topo (+Y)
      this.addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv, [0, 1, 0]);
      // Fundo (-Y)
      this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv, [0, -1, 0]);
      // Esquerda (-X)
      this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv, [-1, 0, 0]);
      // Direita (+X)
      this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv, [1, 0, 0]);
    }
  };

  // =========================================================================
  // CONSTRUÇÃO COMPLETA DA CASA ANTIGA
  // =========================================================================
  function buildHouse() {
    builder.positions = [];
    builder.uvs = [];
    builder.normals = [];
    collisionBoxes = [];
    interactiveObjects = [];

    const H = 3.2; // Altura do teto

    // Helper de paredes sólidas com colisão
    function createWall(x, z, w, d, uv) {
      builder.addBox(x, 0, z, w, H, d, uv || AtlasUV.WALLPAPER);
      collisionBoxes.push({
        minX: x - w/2 - 0.25, maxX: x + w/2 + 0.25,
        minZ: z - d/2 - 0.25, maxZ: z + d/2 + 0.25
      });
    }

    // Helper de piso e teto
    function createRoom(x0, z0, x1, z1, floorUV, ceilUV) {
      // Piso
      builder.addQuad(
        [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0],
        floorUV || AtlasUV.WOOD_FLOOR, [0, 1, 0]
      );
      // Teto
      builder.addQuad(
        [x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1],
        ceilUV || AtlasUV.CEILING, [0, -1, 0]
      );
    }

    // -----------------------------------------------------------------------
    // CÔMODO 1: QUARTO INICIAL (x: -6 a 0, z: -6 a 0)
    // -----------------------------------------------------------------------
    createRoom(-6, -6, 0, 0, AtlasUV.WOOD_FLOOR, AtlasUV.CEILING);
    createWall(-3, -6, 6, 0.3); // Parede Norte
    createWall(-6, -3, 0.3, 6); // Parede Oeste
    createWall(-3, 0, 6, 0.3);  // Parede Sul

    // Parede Leste com vão para a Porta do Quarto
    createWall(0, -4.75, 0.3, 2.5);
    createWall(0, -1.25, 0.3, 2.5);
    // Vão da porta em z: -3.5 a -2.5 (centro z = -3.0, x = 0)

    // Cama no quarto
    builder.addBox(-4.8, 0, -4.8, 1.8, 0.65, 2.2, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: -5.8, maxX: -3.8, minZ: -5.9, maxZ: -3.7 });

    // Criado-mudo com a Chave do Quarto
    builder.addBox(-5.2, 0, -3.2, 0.8, 0.75, 0.7, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: -5.7, maxX: -4.7, minZ: -3.6, maxZ: -2.8 });

    // Mesa de estudo no quarto
    builder.addBox(-1.5, 0, -5.3, 2.2, 0.8, 1.0, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: -2.7, maxX: -0.3, minZ: -5.9, maxZ: -4.7 });

    // -----------------------------------------------------------------------
    // CÔMODO 2: CORREDOR PRINCIPAL (x: 0 a 2.4, z: -10 a 6)
    // -----------------------------------------------------------------------
    createRoom(0, -10, 2.4, 6, AtlasUV.WOOD_FLOOR, AtlasUV.CEILING);
    createWall(1.2, -10, 2.4, 0.3); // Fim norte do corredor

    // Parede leste do corredor (com vão para o banheiro em z = -1.5)
    createWall(2.4, -6.5, 0.3, 7.0);
    createWall(2.4, 3.5, 0.3, 5.0);

    // Mensagem apavorante na parede do corredor ("NÃO OLHE PARA TRÁS")
    builder.addQuad(
      [2.24, 1.2, -4.2], [2.24, 1.2, -2.8], [2.24, 2.2, -2.8], [2.24, 2.2, -4.2],
      AtlasUV.WALL_TEXT, [-1, 0, 0]
    );

    // Retrato antigo na parede do corredor
    builder.addQuad(
      [0.16, 1.3, -7.5], [0.16, 1.3, -6.3], [0.16, 2.3, -6.3], [0.16, 2.3, -7.5],
      AtlasUV.PORTRAIT, [1, 0, 0]
    );

    // -----------------------------------------------------------------------
    // CÔMODO 3: SALA DE ESTAR (x: -7 a 0, z: 0 a 8)
    // -----------------------------------------------------------------------
    createRoom(-7, 0, 0, 8, AtlasUV.WOOD_FLOOR, AtlasUV.CEILING);
    createWall(-3.5, 8, 7.0, 0.3); // Parede Sul
    createWall(-7, 4, 0.3, 8.0);  // Parede Oeste

    // Divisória do corredor com entrada aberta
    createWall(0, 1.2, 0.3, 2.4);
    createWall(0, 6.8, 0.3, 2.4);

    // Sofá antigo na sala
    builder.addBox(-4.5, 0, 4.0, 2.4, 0.85, 1.2, AtlasUV.SOFA_FABRIC);
    collisionBoxes.push({ minX: -5.8, maxX: -3.2, minZ: 3.3, maxZ: 4.7 });

    // Mesa de centro com o Telefone
    builder.addBox(-4.5, 0, 2.2, 1.4, 0.5, 0.9, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: -5.3, maxX: -3.7, minZ: 1.6, maxZ: 2.8 });

    // Estante de TV antiga
    builder.addBox(-1.2, 0, 6.8, 1.6, 0.8, 0.8, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: -2.1, maxX: -0.3, minZ: 6.3, maxZ: 7.3 });

    // Caixa de TV com tela de estática
    builder.addBox(-1.2, 0.8, 6.8, 1.0, 0.8, 0.7, AtlasUV.FURNITURE);
    // Face da TV brilhante virada para a sala (-Z)
    builder.addQuad(
      [-0.8, 0.95, 6.44], [-1.6, 0.95, 6.44], [-1.6, 1.45, 6.44], [-0.8, 1.45, 6.44],
      AtlasUV.TV_SCREEN, [0, 0, -1]
    );

    // -----------------------------------------------------------------------
    // CÔMODO 4: BANHEIRO SINISTRO (x: 2.4 a 7.4, z: -4 a 1)
    // -----------------------------------------------------------------------
    createRoom(2.4, -4, 7.4, 1, AtlasUV.BATH_TILE, AtlasUV.CEILING);
    createWall(4.9, -4, 5.0, 0.3); // Parede Norte
    createWall(7.4, -1.5, 0.3, 5.0); // Parede Leste
    createWall(4.9, 1, 5.0, 0.3);  // Parede Sul

    // Banheira (Esconderijo)
    builder.addBox(6.4, 0, -2.5, 1.4, 0.7, 2.2, AtlasUV.BATH_TILE);
    collisionBoxes.push({ minX: 5.6, maxX: 7.2, minZ: -3.7, maxZ: -1.3 });

    // Pia e Espelho do Banheiro
    builder.addBox(3.8, 0, -3.4, 1.0, 0.85, 0.7, AtlasUV.BATH_TILE);

    // -----------------------------------------------------------------------
    // CÔMODO 5: COZINHA (x: 2.4 a 8.4, z: 1 a 7)
    // -----------------------------------------------------------------------
    createRoom(2.4, 1, 8.4, 7, AtlasUV.KITCHEN_TILE, AtlasUV.CEILING);
    createWall(5.4, 7, 6.0, 0.3); // Parede Sul
    createWall(8.4, 4, 0.3, 6.0); // Parede Leste

    // Balcões da cozinha
    builder.addBox(7.6, 0, 4.0, 0.9, 0.9, 4.0, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: 7.0, maxX: 8.2, minZ: 1.8, maxZ: 6.2 });

    // Mesa da cozinha
    builder.addBox(4.8, 0, 4.0, 1.6, 0.8, 1.2, AtlasUV.FURNITURE);
    collisionBoxes.push({ minX: 3.9, maxX: 5.7, minZ: 3.3, maxZ: 4.7 });

    // -----------------------------------------------------------------------
    // CÔMODO 6: PORTA DE SAÍDA / HALL DE ENTRADA (Fim do corredor ao norte, z = -9.8)
    // -----------------------------------------------------------------------
    // A porta da frente pesada fica em x = 1.2, z = -9.8
    // -----------------------------------------------------------------------

    // Cria as Portas Móveis 3D
    setupDoors();

    // Cria os Itens e Objetos Interativos
    setupInteractables();

    // Configura os Pontos de Luz
    setupLights();

    // Carrega buffers WebGL
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.positions), gl.STATIC_DRAW);

    uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.uvs), gl.STATIC_DRAW);

    normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.normals), gl.STATIC_DRAW);
  }

  // =========================================================================
  // SISTEMA DE PORTAS 3D DINÂMICAS COM PIVÔ DE ROTAÇÃO
  // =========================================================================
  function setupDoors() {
    doors = {
      bedroomDoor: {
        id: 'bedroomDoor',
        name: 'Porta do Quarto',
        x: 0, y: 0, z: -3.0,
        width: 1.0, height: 2.3,
        angle: 0,
        targetAngle: 0,
        isOpen: false,
        isLocked: true,
        requiredKey: 'key_bedroom',
        hingeX: 0, hingeZ: -3.5,
        collisionIdx: null
      },
      bathroomDoor: {
        id: 'bathroomDoor',
        name: 'Porta do Banheiro',
        x: 2.4, y: 0, z: -1.5,
        width: 1.0, height: 2.3,
        angle: 0,
        targetAngle: 0,
        isOpen: false,
        isLocked: false,
        requiredKey: null,
        hingeX: 2.4, hingeZ: -2.0,
        collisionIdx: null
      },
      frontDoor: {
        id: 'frontDoor',
        name: 'Porta da Frente (Saída)',
        x: 1.2, y: 0, z: -9.8,
        width: 1.2, height: 2.4,
        angle: 0,
        targetAngle: 0,
        isOpen: false,
        isLocked: true,
        requiredKey: 'key_exit',
        hingeX: 0.6, hingeZ: -9.8,
        collisionIdx: null
      }
    };

    // Adiciona colisões iniciais das portas fechadas
    doors.bedroomDoor.collisionIdx = collisionBoxes.length;
    collisionBoxes.push({ minX: -0.2, maxX: 0.2, minZ: -3.6, maxZ: -2.4 });

    doors.bathroomDoor.collisionIdx = collisionBoxes.length;
    collisionBoxes.push({ minX: 2.2, maxX: 2.6, minZ: -2.1, maxZ: -0.9 });

    doors.frontDoor.collisionIdx = collisionBoxes.length;
    collisionBoxes.push({ minX: 0.5, maxX: 1.9, minZ: -10.0, maxZ: -9.6 });
  }

  // =========================================================================
  // SISTEMA DE OBJETOS INTERATIVOS NO MUNDO 3D
  // =========================================================================
  function setupInteractables() {
    interactiveObjects = [
      // 1. Lanterna sobre a mesa do quarto
      {
        id: 'item_flashlight',
        type: 'item',
        itemId: 'flashlight',
        name: 'Pegar Lanterna',
        prompt: 'Pegar Lanterna [E]',
        x: -1.6, y: 0.85, z: -5.2,
        radius: 1.4,
        collected: false
      },
      // 2. Chave do Quarto sobre o criado-mudo
      {
        id: 'item_key_bedroom',
        type: 'item',
        itemId: 'key_bedroom',
        name: 'Pegar Chave do Quarto',
        prompt: 'Pegar Chave Antiga [E]',
        x: -5.2, y: 0.8, z: -3.2,
        radius: 1.3,
        collected: false
      },
      // 3. Documento #1 no quarto
      {
        id: 'note_bedroom',
        type: 'document',
        docId: 'note_bedroom',
        name: 'Ler Anotação Rasgada',
        prompt: 'Ler Registro [E]',
        x: -1.1, y: 0.85, z: -5.1,
        radius: 1.3,
        collected: false
      },
      // 4. Porta do Quarto
      {
        id: 'door_bedroom',
        type: 'door',
        doorRef: 'bedroomDoor',
        name: 'Porta do Quarto',
        prompt: 'Abrir Porta [E]',
        x: 0, y: 1.1, z: -3.0,
        radius: 1.8
      },
      // 5. Porta do Banheiro
      {
        id: 'door_bathroom',
        type: 'door',
        doorRef: 'bathroomDoor',
        name: 'Porta do Banheiro',
        prompt: 'Abrir Porta [E]',
        x: 2.4, y: 1.1, z: -1.5,
        radius: 1.8
      },
      // 6. Esconderijo na Banheira
      {
        id: 'hiding_bathtub',
        type: 'hiding',
        name: 'Esconderijo (Banheira)',
        prompt: 'Esconder-se na Banheira [E]',
        x: 6.4, y: 0.6, z: -2.5,
        radius: 1.6,
        isHiding: false
      },
      // 7. Pilha extra no banheiro
      {
        id: 'item_battery_1',
        type: 'item',
        itemId: 'battery',
        name: 'Pegar Pilha',
        prompt: 'Pegar Pilha Alcalina [E]',
        x: 3.8, y: 0.9, z: -3.4,
        radius: 1.3,
        collected: false
      },
      // 8. Telefone da Sala (pode tocar em evento)
      {
        id: 'telephone',
        type: 'telephone',
        name: 'Telefone Antigo',
        prompt: 'Atender Telefone [E]',
        x: -4.5, y: 0.55, z: 2.2,
        radius: 1.5,
        isRinging: false
      },
      // 9. Documento #2 na mesa da sala
      {
        id: 'note_living',
        type: 'document',
        docId: 'note_living',
        name: 'Ler Página Solta',
        prompt: 'Ler Página [E]',
        x: -4.0, y: 0.55, z: 2.2,
        radius: 1.3,
        collected: false
      },
      // 10. TV da Sala
      {
        id: 'tv_set',
        type: 'tv',
        name: 'Aparelho de TV',
        prompt: 'Interagir com a TV [E]',
        x: -1.2, y: 1.0, z: 6.6,
        radius: 1.6,
        isOn: false
      },
      // 11. Chave da Saída (na cozinha)
      {
        id: 'item_key_exit',
        type: 'item',
        itemId: 'key_exit',
        name: 'Pegar Chave da Saída',
        prompt: 'Pegar Chave de Ferro [E]',
        x: 7.6, y: 0.95, z: 4.8,
        radius: 1.4,
        collected: false
      },
      // 12. Documento #3 na cozinha
      {
        id: 'note_kitchen',
        type: 'document',
        docId: 'note_kitchen',
        name: 'Ler Bilhete Apressado',
        prompt: 'Ler Bilhete [E]',
        x: 4.8, y: 0.85, z: 4.0,
        radius: 1.4,
        collected: false
      },
      // 13. Porta Principal (Saída do Capítulo 1)
      {
        id: 'door_front',
        type: 'door',
        doorRef: 'frontDoor',
        name: 'Porta da Frente',
        prompt: 'Abrir Porta Principal [E]',
        x: 1.2, y: 1.1, z: -9.8,
        radius: 2.0
      }
    ];
  }

  // =========================================================================
  // ILUMINAÇÃO AMBIENTE (PONTOS DE LUZ FIXOS)
  // =========================================================================
  function setupLights() {
    // 0: Lâmpada do teto do Quarto Inicial (quente e agradável)
    pointLights[0].x = -3.0; pointLights[0].y = 2.8; pointLights[0].z = -3.0;
    pointLights[0].r = 0.98; pointLights[0].g = 0.88; pointLights[0].b = 0.68;
    pointLights[0].intensity = 0.75;
    pointLights[0].radius = 7.5;
    pointLights[0].enabled = 1;

    // 1: Lâmpada central do Corredor
    pointLights[1].x = 1.2; pointLights[1].y = 2.7; pointLights[1].z = -3.5;
    pointLights[1].r = 0.92; pointLights[1].g = 0.88; pointLights[1].b = 0.80;
    pointLights[1].intensity = 0.70;
    pointLights[1].radius = 9.0;
    pointLights[1].enabled = 1;

    // 2: Luz aconchegante da Sala de Estar / Abajur
    pointLights[2].x = -4.5; pointLights[2].y = 2.4; pointLights[2].z = 3.5;
    pointLights[2].r = 0.95; pointLights[2].g = 0.85; pointLights[2].b = 0.70;
    pointLights[2].intensity = 0.65;
    pointLights[2].radius = 8.5;
    pointLights[2].enabled = 1;

    // 3: Brilho dinâmico da TV na Sala (estática azul, ativada em evento)
    pointLights[3].x = -1.2; pointLights[3].y = 1.2; pointLights[3].z = 6.3;
    pointLights[3].r = 0.50; pointLights[3].g = 0.70; pointLights[3].b = 1.0;
    pointLights[3].intensity = 0.0;
    pointLights[3].radius = 6.5;
    pointLights[3].enabled = 0;

    // 4: Luz da Cozinha (sobre os balcões e mesa)
    pointLights[4].x = 5.4; pointLights[4].y = 2.7; pointLights[4].z = 4.0;
    pointLights[4].r = 0.92; pointLights[4].g = 0.92; pointLights[4].b = 0.88;
    pointLights[4].intensity = 0.70;
    pointLights[4].radius = 8.0;
    pointLights[4].enabled = 1;

    // 5: Luz do Banheiro (sobre a pia e espelho)
    pointLights[5].x = 4.9; pointLights[5].y = 2.7; pointLights[5].z = -1.5;
    pointLights[5].r = 0.75; pointLights[5].g = 0.88; pointLights[5].b = 0.85;
    pointLights[5].intensity = 0.65;
    pointLights[5].radius = 6.5;
    pointLights[5].enabled = 1;
  }

  // =========================================================================
  // PARTICULAS DE POEIRA FLUTUANTE
  // =========================================================================
  function initDust() {
    dustParticles = [];
    for (let i = 0; i < MAX_DUST; i++) {
      dustParticles.push({
        x: (Math.random() - 0.5) * 14,
        y: Math.random() * 2.8 + 0.2,
        z: (Math.random() - 0.5) * 18,
        size: Math.random() * 2.5 + 1.0,
        speedY: (Math.random() - 0.5) * 0.004,
        speedX: (Math.random() - 0.5) * 0.003,
        alpha: Math.random() * 0.4 + 0.1
      });
    }
  }

  function updateDust(dt) {
    dustParticles.forEach(p => {
      p.y += p.speedY;
      p.x += p.speedX;
      if (p.y < 0.1) p.y = 2.8;
      if (p.y > 3.0) p.y = 0.2;
    });
  }

  // =========================================================================
  // COLISÃO DO JOGADOR COM PAREDES E MÓVEIS (SLIDING COLLISION)
  // =========================================================================
  function checkCollision(x, z, radius = 0.32) {
    for (let i = 0; i < collisionBoxes.length; i++) {
      const b = collisionBoxes[i];
      if (b && x + radius > b.minX && x - radius < b.maxX &&
               z + radius > b.minZ && z - radius < b.maxZ) {
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // RAYCASTING DE INTERAÇÃO ([E] INTERAGIR)
  // =========================================================================
  function getInteractable(origin, dir, maxDist = 2.4) {
    let closest = null;
    let closestDist = maxDist;

    for (let i = 0; i < interactiveObjects.length; i++) {
      const obj = interactiveObjects[i];
      if (obj.collected) continue;

      // Vetor da câmera até o objeto
      const dx = obj.x - origin.x;
      const dy = obj.y - origin.y;
      const dz = obj.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist <= maxDist) {
        // Produto escalar para verificar se está no cone de visão frontal
        const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
        if (dot > 0.72) { // Ângulo cônico ~45 graus
          if (dist < closestDist) {
            closestDist = dist;
            closest = obj;
          }
        }
      }
    }

    return closest;
  }

  // =========================================================================
  // ATUALIZAÇÃO DO MUNDO (PORTAS, LUZES PISCANDO, EVENTOS)
  // =========================================================================
  function update(dt, timeSec) {
    // 1. Animação suave de abertura das portas
    for (const key in doors) {
      const door = doors[key];
      const diff = door.targetAngle - door.angle;
      if (Math.abs(diff) > 0.01) {
        door.angle += diff * 8.0 * dt;
      } else {
        door.angle = door.targetAngle;
      }
    }

    // 2. Variações dinâmicas naturais e sutis nas lâmpadas da casa (Regra 7)
    if (pointLights[0].enabled) {
      pointLights[0].intensity = 0.75 + Math.sin(timeSec * 2.5) * 0.03;
    }
    if (pointLights[1].enabled) {
      pointLights[1].intensity = 0.70 + Math.sin(timeSec * 1.8 + 1.2) * 0.03;
    }
    if (pointLights[2].enabled) {
      pointLights[2].intensity = 0.65 + Math.sin(timeSec * 2.1 + 2.5) * 0.025;
    }
    if (pointLights[4].enabled) {
      pointLights[4].intensity = 0.70 + Math.sin(timeSec * 2.3 + 3.7) * 0.03;
    }
    if (pointLights[5].enabled) {
      pointLights[5].intensity = 0.65 + Math.sin(timeSec * 2.8 + 4.2) * 0.025;
    }

    // 3. Luz da TV tremeluz com estática azul quando ligada
    if (pointLights[3].enabled) {
      pointLights[3].intensity = 0.45 + Math.random() * 0.25;
    }

    updateDust(dt);
  }

  // =========================================================================
  // RENDERIZAÇÃO 3D (CENA WEBGL)
  // =========================================================================
  function render(player, entity, timeSec) {
    if (!gl || !shaderProgram) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.06, 0.07, 0.09, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(shaderProgram);

    // Câmera do Jogador
    const aspect = canvas.width / canvas.height;
    const projMatrix = Mat4.perspective(player.fovRad, aspect, 0.1, 35.0);

    const eye = [player.pos.x, player.pos.y + player.cameraHeightOffset, player.pos.z];
    const target = [
      eye[0] + player.forward.x,
      eye[1] + player.forward.y,
      eye[2] + player.forward.z
    ];
    const up = [0, 1, 0];
    const viewMatrix = Mat4.lookAt(eye, target, up);
    const viewProjMatrix = Mat4.multiply(projMatrix, viewMatrix);

    // Uniformes de Iluminação Global (Regra 4: ambientLight base 0.20 - 0.35)
    gl.uniform3f(uAmbientLightLoc, 0.26, 0.27, 0.30);
    gl.uniform3f(uFogColorLoc, 0.08, 0.09, 0.12);
    gl.uniform3f(uFogParamsLoc, 10.0, 36.0, 0.03); // Visão ampla e clara sem escuridão exagerada

    // Uniformes da Lanterna (Regra 5: cone amplo e centro claro)
    gl.uniform3f(uFlashlightPosLoc, eye[0], eye[1] - 0.15, eye[2]);
    gl.uniform3f(uFlashlightDirLoc, player.forward.x, player.forward.y, player.forward.z);

    // Bateria / Tremor da lanterna
    const flashIntensity = player.getFlashlightIntensity();
    const flashCutOff = Math.cos(24 * Math.PI / 180);       // Centro nítido (~24 graus)
    const flashOuterCutOff = Math.cos(48 * Math.PI / 180);  // Penumbra ampla (~48 graus)
    gl.uniform4f(
      uFlashlightParamsLoc,
      flashCutOff,
      flashOuterCutOff,
      flashIntensity,
      player.isFlashlightOn ? 1.0 : 0.0
    );

    // Uniformes dos 6 Pontos de Luz
    for (let i = 0; i < 6; i++) {
      const pl = pointLights[i];
      gl.uniform3f(pl.posLoc, pl.x, pl.y, pl.z);
      gl.uniform3f(pl.colLoc, pl.r, pl.g, pl.b);
      gl.uniform3f(pl.paramLoc, pl.intensity, pl.radius, pl.enabled);
    }
      gl.uniform3f(pl.paramLoc, pl.intensity, pl.radius, pl.enabled);
    }

    // Configuração dos Buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const posAttr = gl.getAttribLocation(shaderProgram, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    const uvAttr = gl.getAttribLocation(shaderProgram, 'a_uv');
    gl.enableVertexAttribArray(uvAttr);
    gl.vertexAttribPointer(uvAttr, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    const normAttr = gl.getAttribLocation(shaderProgram, 'a_normal');
    gl.enableVertexAttribArray(normAttr);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureAtlas);

    // Renderiza a Geometria Estática da Casa
    const modelMatrix = Mat4.identity();
    gl.uniformMatrix4fv(uModelMatrixLoc, false, modelMatrix);
    gl.uniformMatrix4fv(uMatrixLoc, false, viewProjMatrix);

    const vertexCount = builder.positions.length / 3;
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    // Renderiza Portas com Rotação em Seus Pivôs
    renderDynamicDoors(viewProjMatrix);

    // Renderiza O Observador (Billboard Espectral)
    if (entity && entity.isActive) {
      renderObserverBillboard(entity, viewProjMatrix, eye);
    }

    // Renderiza Pós-Processamento 2D no fx-canvas (VHS, Aberração, Scanlines)
    renderPostFX(player, timeSec);
  }

  // =========================================================================
  // RENDERIZAÇÃO DAS PORTAS COM ROTAÇÃO 3D
  // =========================================================================
  function renderDynamicDoors(viewProjMatrix) {
    for (const key in doors) {
      const door = doors[key];
      // Matriz de transformação da porta com rotação na dobradiça
      let m = Mat4.identity();
      m = Mat4.translate(m, [door.hingeX, door.y, door.hingeZ]);
      m = Mat4.rotateY(m, door.angle);

      const mvp = Mat4.multiply(viewProjMatrix, m);
      gl.uniformMatrix4fv(uModelMatrixLoc, false, m);
      gl.uniformMatrix4fv(uMatrixLoc, false, mvp);

      // Desenha o modelo da porta
      drawDoorMesh(door.width, door.height);
    }
  }

  let doorMeshBuffer = null;
  let doorUVBuffer = null;
  let doorNormBuffer = null;

  function drawDoorMesh(w, h) {
    if (!doorMeshBuffer) {
      const d = 0.08;
      const b = { positions: [], uvs: [], normals: [] };
      const uv = AtlasUV.DOOR;

      // Frente
      b.positions.push(0, 0, d/2, w, 0, d/2, w, h, d/2, 0, 0, d/2, w, h, d/2, 0, h, d/2);
      b.uvs.push(uv[0], uv[3], uv[2], uv[3], uv[2], uv[1], uv[0], uv[3], uv[2], uv[1], uv[0], uv[1]);
      for (let i = 0; i < 6; i++) b.normals.push(0, 0, 1);

      // Trás
      b.positions.push(w, 0, -d/2, 0, 0, -d/2, 0, h, -d/2, w, 0, -d/2, 0, h, -d/2, w, h, -d/2);
      b.uvs.push(uv[2], uv[3], uv[0], uv[3], uv[0], uv[1], uv[2], uv[3], uv[0], uv[1], uv[2], uv[1]);
      for (let i = 0; i < 6; i++) b.normals.push(0, 0, -1);

      doorMeshBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, doorMeshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.positions), gl.STATIC_DRAW);

      doorUVBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, doorUVBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.uvs), gl.STATIC_DRAW);

      doorNormBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, doorNormBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.normals), gl.STATIC_DRAW);
    }

    const posAttr = gl.getAttribLocation(shaderProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, doorMeshBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

    const uvAttr = gl.getAttribLocation(shaderProgram, 'a_uv');
    gl.bindBuffer(gl.ARRAY_BUFFER, doorUVBuffer);
    gl.vertexAttribPointer(uvAttr, 2, gl.FLOAT, false, 0, 0);

    const normAttr = gl.getAttribLocation(shaderProgram, 'a_normal');
    gl.bindBuffer(gl.ARRAY_BUFFER, doorNormBuffer);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 12);
  }

  // =========================================================================
  // RENDERIZAÇÃO DO OBSERVADOR (BILLBOARD ESPECTRAL QUE OLHA PRO JOGADOR)
  // =========================================================================
  let observerMeshBuffer = null;
  let observerUVBuffer = null;
  let observerNormBuffer = null;

  function renderObserverBillboard(entity, viewProjMatrix, eye) {
    if (!observerMeshBuffer) {
      const w = 1.0, h = 2.4;
      const uv = AtlasUV.OBSERVER;
      const b = {
        positions: [-w/2, 0, 0, w/2, 0, 0, w/2, h, 0, -w/2, 0, 0, w/2, h, 0, -w/2, h, 0],
        uvs: [uv[0], uv[3], uv[2], uv[3], uv[2], uv[1], uv[0], uv[3], uv[2], uv[1], uv[0], uv[1]],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]
      };
      observerMeshBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, observerMeshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.positions), gl.STATIC_DRAW);

      observerUVBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, observerUVBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.uvs), gl.STATIC_DRAW);

      observerNormBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, observerNormBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.normals), gl.STATIC_DRAW);
    }

    // Calcula rotação Yaw para sempre encarar o jogador
    const dx = eye[0] - entity.pos.x;
    const dz = eye[2] - entity.pos.z;
    const angleY = Math.atan2(dx, dz);

    let m = Mat4.identity();
    m = Mat4.translate(m, [entity.pos.x, entity.pos.y, entity.pos.z]);
    m = Mat4.rotateY(m, angleY);

    const mvp = Mat4.multiply(viewProjMatrix, m);
    gl.uniformMatrix4fv(uModelMatrixLoc, false, m);
    gl.uniformMatrix4fv(uMatrixLoc, false, mvp);

    // Habilita blending para transparência espectral
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const posAttr = gl.getAttribLocation(shaderProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, observerMeshBuffer);
    gl.vertexAttribPointer(posAttr, 3, gl.FLOAT, false, 0, 0);

    const uvAttr = gl.getAttribLocation(shaderProgram, 'a_uv');
    gl.bindBuffer(gl.ARRAY_BUFFER, observerUVBuffer);
    gl.vertexAttribPointer(uvAttr, 2, gl.FLOAT, false, 0, 0);

    const normAttr = gl.getAttribLocation(shaderProgram, 'a_normal');
    gl.bindBuffer(gl.ARRAY_BUFFER, observerNormBuffer);
    gl.vertexAttribPointer(normAttr, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }

  // =========================================================================
  // PÓS-PROCESSAMENTO 2D RETRO-HORROR (VHS, SCANLINES, RUÍDO E POEIRA)
  // =========================================================================
  function renderPostFX(player, timeSec) {
    if (!fxCtx || !fxCanvas) return;

    const w = fxCanvas.width;
    const h = fxCanvas.height;
    fxCtx.clearRect(0, 0, w, h);

    // 1. Linhas de Scanlines VHS
    fxCtx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    for (let y = 0; y < h; y += 4) {
      fxCtx.fillRect(0, y, w, 1.5);
    }

    // 2. Linha de rastreio de fita VHS (passa periodicamente descendo a tela)
    const trackingY = (timeSec * 70) % (h + 100) - 50;
    fxCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    fxCtx.fillRect(0, trackingY, w, 12);
    fxCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    fxCtx.fillRect(0, trackingY + 4, w, 3);

    // 3. Partículas de poeira flutuando no ar (iluminadas)
    fxCtx.fillStyle = 'rgba(230, 240, 255, 0.28)';
    for (let i = 0; i < dustParticles.length; i++) {
      const p = dustParticles[i];
      // Projeção simples na tela para efeito de presença
      const scrX = ((p.x - player.pos.x) * 120 + w / 2) % w;
      const scrY = ((p.y - player.pos.y) * 120 + h / 2) % h;
      if (scrX > 0 && scrX < w && scrY > 0 && scrY < h) {
        fxCtx.beginPath();
        fxCtx.arc(scrX, scrY, p.size, 0, Math.PI * 2);
        fxCtx.fill();
      }
    }

    // 4. Distorção de Paranoia / Batimento Cardíaco nos cantos
    if (player.sanity > 30) {
      const intensity = (player.sanity - 30) / 70;
      fxCtx.strokeStyle = `rgba(180, 20, 20, ${intensity * 0.4})`;
      fxCtx.lineWidth = 15;
      fxCtx.strokeRect(0, 0, w, h);
    }
  }

  // =========================================================================
  // MANIPULADORES DE PORTAS E ESTADO
  // =========================================================================
  function toggleDoor(doorId) {
    const door = doors[doorId];
    if (!door) return false;

    if (door.isLocked) {
      return 'locked';
    }

    door.isOpen = !door.isOpen;
    door.targetAngle = door.isOpen ? Math.PI * 0.48 : 0;

    // Atualiza colisão da porta
    if (door.collisionIdx !== null && collisionBoxes[door.collisionIdx]) {
      if (door.isOpen) {
        collisionBoxes[door.collisionIdx] = null; // Remove colisão para passagem
      } else {
        // Restaura colisão
        if (doorId === 'bedroomDoor') {
          collisionBoxes[door.collisionIdx] = { minX: -0.2, maxX: 0.2, minZ: -3.6, maxZ: -2.4 };
        } else if (doorId === 'bathroomDoor') {
          collisionBoxes[door.collisionIdx] = { minX: 2.2, maxX: 2.6, minZ: -2.1, maxZ: -0.9 };
        } else if (doorId === 'frontDoor') {
          collisionBoxes[door.collisionIdx] = { minX: 0.5, maxX: 1.9, minZ: -10.0, maxZ: -9.6 };
        }
      }
    }

    return door.isOpen ? 'opened' : 'closed';
  }

  function unlockDoor(doorId) {
    const door = doors[doorId];
    if (door) {
      door.isLocked = false;
      return true;
    }
    return false;
  }

  function setTVState(turnOn) {
    const tv = interactiveObjects.find(o => o.id === 'tv_set');
    if (tv) tv.isOn = turnOn;
    pointLights[3].enabled = turnOn ? 1 : 0;
    if (window.GameAudio) {
      if (turnOn) window.GameAudio.startTVStatic(-0.6, 0.18);
      else window.GameAudio.stopTVStatic();
    }
  }

  function serialize() {
    return {
      doors: Object.keys(doors).reduce((acc, k) => {
        acc[k] = { isOpen: doors[k].isOpen, isLocked: doors[k].isLocked };
        return acc;
      }, {}),
      interactiveObjects: interactiveObjects.map(o => ({ id: o.id, collected: !!o.collected }))
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.doors) {
      for (const k in data.doors) {
        if (doors[k]) {
          doors[k].isLocked = data.doors[k].isLocked;
          if (data.doors[k].isOpen) {
            doors[k].isOpen = true;
            doors[k].angle = Math.PI * 0.48;
            doors[k].targetAngle = Math.PI * 0.48;
            if (doors[k].collisionIdx !== null) collisionBoxes[doors[k].collisionIdx] = null;
          }
        }
      }
    }
    if (data.interactiveObjects) {
      data.interactiveObjects.forEach(saved => {
        const obj = interactiveObjects.find(o => o.id === saved.id);
        if (obj && saved.collected) obj.collected = true;
      });
    }
  }

  return {
    init,
    update,
    render,
    checkCollision,
    getInteractable,
    toggleDoor,
    unlockDoor,
    setTVState,
    get doors() { return doors; },
    get interactiveObjects() { return interactiveObjects; },
    get pointLights() { return pointLights; },
    serialize,
    deserialize
  };
})();
