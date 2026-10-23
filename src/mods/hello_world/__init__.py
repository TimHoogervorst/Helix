def register(mod):
    """Keep package metadata discovery independent of Django model loading."""
    from .mod import register as register_contributions

    register_contributions(mod)

__all__ = ["register"]
