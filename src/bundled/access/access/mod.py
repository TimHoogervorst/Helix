from django.urls import include, path

def register(mod):

    mod.register_urls([path("api/access/", include("bundled.access.access.urls"))])
