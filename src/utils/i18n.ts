/**
 * i18n.ts — Minimal locale helper
 * Place in: src/utils/i18n.ts (shared by ArchView and PyPoints)
 *
 * Reads vscode.env.language and returns the best matching locale.
 * Supported: es, en, pt, fr, de, zh, ja, ko — fallback: en
 */

import * as vscode from 'vscode';

type SupportedLocale = 'es' | 'en' | 'pt' | 'fr' | 'de' | 'zh' | 'ja' | 'ko';

function getLocale(): SupportedLocale {
  const lang = vscode.env.language?.toLowerCase() ?? 'en';
  if (lang.startsWith('es')) { return 'es'; }
  if (lang.startsWith('pt')) { return 'pt'; }
  if (lang.startsWith('fr')) { return 'fr'; }
  if (lang.startsWith('de')) { return 'de'; }
  if (lang.startsWith('zh')) { return 'zh'; }
  if (lang.startsWith('ja')) { return 'ja'; }
  if (lang.startsWith('ko')) { return 'ko'; }
  return 'en';
}

type MessageSet = {
  installBtn:         string;
  notNow:             string;
  dismiss:            string;
  pypointsTier1:      string;
  pypointsTier2:      string;
  pypointsTier3:      string;
  pypointsFilePython: string;
  pypointsFileOther:  string;
  archviewTip:        string;
};

const messages: Record<SupportedLocale, MessageSet> = {
  es: {
    installBtn:         'Instalar',
    notNow:             'Ahora no',
    dismiss:            'Ignorar',
    pypointsTier1:      'Proyecto Python detectado. PyPoints te permite explorar, probar y validar tus endpoints Flask/FastAPI/Django directamente en VS Code, sin Postman.',
    pypointsTier2:      'Trabajas con Python? PyPoints explora y prueba tus endpoints de API (Flask, FastAPI, Django) sin salir de VS Code.',
    pypointsTier3:      'Tambien trabajas con APIs en Python? PyPoints es un explorador de endpoints y cliente REST gratuito para Flask, FastAPI y Django.',
    pypointsFilePython: 'Agregando archivos Python a tu contexto? PyPoints prueba y explora tus endpoints Flask/FastAPI/Django directamente en VS Code.',
    pypointsFileOther:  'Sabias que PyPoints es un explorador de endpoints y cliente REST gratuito para APIs en Python? Es un buen complemento para ArchView.',
    archviewTip:        'Preparas contexto para Claude, ChatGPT u otro modelo? ArchView mapea tu proyecto, selecciona archivos y optimiza tokens directamente en VS Code.',
  },
  en: {
    installBtn:         'Install',
    notNow:             'Not now',
    dismiss:            'Dismiss',
    pypointsTier1:      'Python backend detected. PyPoints lets you explore, test and validate your Flask/FastAPI/Django endpoints directly in VS Code, no Postman needed.',
    pypointsTier2:      'Working with Python? PyPoints explores and tests your API endpoints (Flask, FastAPI, Django) directly in VS Code.',
    pypointsTier3:      'Do you also work with Python APIs? PyPoints is a free endpoint explorer and REST tester for Flask, FastAPI and Django, built for VS Code.',
    pypointsFilePython: 'Adding Python files to your AI context? PyPoints tests and explores your Flask/FastAPI/Django endpoints directly in VS Code.',
    pypointsFileOther:  'Did you know PyPoints is a free endpoint explorer and REST tester for Python APIs? It works great alongside ArchView.',
    archviewTip:        'Building AI context for Claude, ChatGPT or another model? ArchView maps your project, selects files and optimizes tokens directly in VS Code.',
  },
  pt: {
    installBtn:         'Instalar',
    notNow:             'Agora nao',
    dismiss:            'Ignorar',
    pypointsTier1:      'Projeto Python detectado. PyPoints permite explorar, testar e validar seus endpoints Flask/FastAPI/Django direto no VS Code, sem Postman.',
    pypointsTier2:      'Trabalhando com Python? PyPoints explora e testa seus endpoints (Flask, FastAPI, Django) sem sair do VS Code.',
    pypointsTier3:      'Voce tambem trabalha com APIs Python? PyPoints e um explorador de endpoints e cliente REST gratuito para Flask, FastAPI e Django.',
    pypointsFilePython: 'Adicionando arquivos Python ao seu contexto? PyPoints testa e explora seus endpoints Flask/FastAPI/Django direto no VS Code.',
    pypointsFileOther:  'Sabia que PyPoints e um explorador de endpoints gratuito para APIs Python? E um otimo complemento para ArchView.',
    archviewTip:        'Preparando contexto para Claude, ChatGPT ou outro modelo? ArchView mapeia seu projeto, seleciona arquivos e otimiza tokens no VS Code.',
  },
  fr: {
    installBtn:         'Installer',
    notNow:             'Pas maintenant',
    dismiss:            'Ignorer',
    pypointsTier1:      'Projet Python detecte. PyPoints vous permet d\'explorer, tester et valider vos endpoints Flask/FastAPI/Django directement dans VS Code, sans Postman.',
    pypointsTier2:      'Vous travaillez avec Python? PyPoints explore et teste vos endpoints d\'API (Flask, FastAPI, Django) directement dans VS Code.',
    pypointsTier3:      'Vous travaillez aussi avec des APIs Python? PyPoints est un explorateur d\'endpoints et client REST gratuit pour Flask, FastAPI et Django.',
    pypointsFilePython: 'Vous ajoutez des fichiers Python a votre contexte? PyPoints teste vos endpoints Flask/FastAPI/Django directement dans VS Code.',
    pypointsFileOther:  'Le saviez-vous? PyPoints est un client REST gratuit pour les APIs Python, parfait en complement d\'ArchView.',
    archviewTip:        'Vous preparez du contexte pour Claude, ChatGPT ou un autre modele? ArchView cartographie votre projet et optimise les tokens dans VS Code.',
  },
  de: {
    installBtn:         'Installieren',
    notNow:             'Jetzt nicht',
    dismiss:            'Schliessen',
    pypointsTier1:      'Python-Backend erkannt. PyPoints ermoeglicht es, Flask/FastAPI/Django-Endpunkte direkt in VS Code zu erkunden und zu testen, ohne Postman.',
    pypointsTier2:      'Arbeitest du mit Python? PyPoints erkundet und testet deine API-Endpunkte (Flask, FastAPI, Django) direkt in VS Code.',
    pypointsTier3:      'Arbeitest du auch mit Python-APIs? PyPoints ist ein kostenloser Endpunkt-Explorer und REST-Client fuer Flask, FastAPI und Django.',
    pypointsFilePython: 'Python-Dateien zum Kontext hinzugefuegt? PyPoints testet deine Flask/FastAPI/Django-Endpunkte direkt in VS Code.',
    pypointsFileOther:  'Wusstest du? PyPoints ist ein kostenloser REST-Client fuer Python-APIs und ergaenzt ArchView ideal.',
    archviewTip:        'Kontext fuer Claude, ChatGPT oder ein anderes Modell vorbereiten? ArchView kartiert dein Projekt und optimiert Tokens in VS Code.',
  },
  zh: {
    installBtn:         '安装',
    notNow:             '暂不',
    dismiss:            '忽略',
    pypointsTier1:      '检测到 Python 后端项目。PyPoints 可在 VS Code 中直接探索、测试和验证您的 Flask/FastAPI/Django 接口，无需 Postman。',
    pypointsTier2:      '正在使用 Python？PyPoints 可在 VS Code 中直接探索和测试您的 API 接口（Flask、FastAPI、Django）。',
    pypointsTier3:      '您也在使用 Python API 吗？PyPoints 是一款免费的端点浏览器和 REST 客户端，支持 Flask、FastAPI 和 Django。',
    pypointsFilePython: '正在将 Python 文件添加到 AI 上下文？PyPoints 可直接在 VS Code 中测试您的 Flask/FastAPI/Django 接口。',
    pypointsFileOther:  'PyPoints 是一款免费的 Python API 端点浏览器，与 ArchView 完美配合。',
    archviewTip:        '正在为 Claude、ChatGPT 或其他模型准备上下文？ArchView 可在 VS Code 中映射项目结构并优化 Token。',
  },
  ja: {
    installBtn:         'インストール',
    notNow:             '後で',
    dismiss:            '閉じる',
    pypointsTier1:      'Python バックエンドを検出しました。PyPoints を使うと、Flask/FastAPI/Django のエンドポイントを VS Code 内で直接テストできます。Postman は不要です。',
    pypointsTier2:      'Python を使っていますか？PyPoints は VS Code 内で API エンドポイント（Flask、FastAPI、Django）を探索・テストします。',
    pypointsTier3:      'Python API も使っていますか？PyPoints は Flask/FastAPI/Django 向けの無料エンドポイントエクスプローラーです。',
    pypointsFilePython: 'Python ファイルをコンテキストに追加中ですか？PyPoints で Flask/FastAPI/Django エンドポイントを VS Code 内でテストできます。',
    pypointsFileOther:  'PyPoints は Python API 向けの無料 REST クライアントで、ArchView との相性も抜群です。',
    archviewTip:        'Claude、ChatGPT などのモデル向けにコンテキストを準備中ですか？ArchView はプロジェクト構造をマップし、トークンを最適化します。',
  },
  ko: {
    installBtn:         '설치',
    notNow:             '나중에',
    dismiss:            '닫기',
    pypointsTier1:      'Python 백엔드 프로젝트가 감지되었습니다. PyPoints를 사용하면 VS Code에서 바로 Flask/FastAPI/Django 엔드포인트를 탐색하고 테스트할 수 있습니다.',
    pypointsTier2:      'Python으로 작업 중인가요? PyPoints는 VS Code에서 Flask, FastAPI, Django API 엔드포인트를 탐색하고 테스트합니다.',
    pypointsTier3:      'Python API도 사용하시나요? PyPoints는 Flask, FastAPI, Django를 위한 무료 엔드포인트 탐색기입니다.',
    pypointsFilePython: 'Python 파일을 AI 컨텍스트에 추가 중인가요? PyPoints로 Flask/FastAPI/Django 엔드포인트를 VS Code에서 바로 테스트하세요.',
    pypointsFileOther:  'PyPoints는 Python API를 위한 무료 REST 클라이언트로 ArchView와 함께 사용하면 더욱 좋습니다.',
    archviewTip:        'Claude, ChatGPT 또는 다른 모델을 위한 AI 컨텍스트를 준비 중인가요? ArchView는 프로젝트 구조를 분석하고 토큰을 최적화합니다.',
  },
};

export function t(): MessageSet {
  return messages[getLocale()];
}