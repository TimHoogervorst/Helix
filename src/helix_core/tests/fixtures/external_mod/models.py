from helix_core.abstracts import AbstractEntity


class ConcreteTestEntity(AbstractEntity):
    class Meta:
        app_label = "helix_core"
        db_table = "helix_test_concrete_entity"
