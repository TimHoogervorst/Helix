"""
Django settings for Helix project.
"""
import os
from pathlib import Path

from helix_core.mod_system.loader import get_helix_mods

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

ALLOWED_HOSTS = ["*"]


# Application definition

# ── Helix Mod System ─────────────────────────────────────────────────────────

# Override auto-discovery by setting HELIX_MODS to an explicit list of
# dotted mod paths (e.g. ["mods.eln", "mods.lims"]).  When None
# (the default), all mods/*/mod.py directories are auto-discovered.
HELIX_MODS = None

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "drf_spectacular",
    "django_filters",
    # Helix platform
    "helix_core",
    "core",
    "users",
    # Helix mods — auto-discovered from mods/*/mod.py (or overridden
    # via HELIX_MODS above).  Returned in dependency order.
    *get_helix_mods(base_dir=BASE_DIR, helix_mods_override=HELIX_MODS),
    "core.mentions",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "openscience"),
        "USER": os.environ.get("POSTGRES_USER", "openscience"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "openscience"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# If DATABASE_URL is set, parse it (Docker env)
if os.environ.get("DATABASE_URL"):
    import re
    url = os.environ["DATABASE_URL"]
    # Support sqlite:// for local testing
    if url.startswith("sqlite"):
        DATABASES["default"] = {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": url.replace("sqlite://", ""),
        }
    else:
        m = re.match(r"postgres://(?P<user>.+):(?P<password>.+)@(?P<host>.+):(?P<port>\d+)/(?P<name>.+)", url)
        if m:
            DATABASES["default"].update({
                "NAME": m.group("name"),
                "USER": m.group("user"),
                "PASSWORD": m.group("password"),
                "HOST": m.group("host"),
                "PORT": m.group("port"),
            })


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = "static/"


# Default primary key field type

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Test runner — provisions test-only tables (e.g. ConcreteTestEntity) that
# conftest.py handles under pytest.

TEST_RUNNER = "config.test_runner.HelixTestRunner"


# Custom user model

AUTH_USER_MODEL = "core.User"


# ── ELN ────────────────────────────────────────────────────────────────────

# Minutes before a held entry lock is considered stale and can be stolen.
ELN_LOCK_TIMEOUT_MINUTES = 5


# Session lifetime — one week
SESSION_COOKIE_AGE = 604800  # seconds (7 days)

# Django REST Framework

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/minute",
        "register": "5/minute",
    },
}


# DRF Spectacular

SPECTACULAR_SETTINGS = {
    "TITLE": "Helix API",
    "DESCRIPTION": "Open-source ELN/LIMS for research labs",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}


# CORS

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# CSRF — trust the frontend dev-server origin (Vite proxy rewrites the Host header)
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
