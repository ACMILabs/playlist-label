import pytest
from peewee import SqliteDatabase

from app import main
from app.main import HasTapped, Message


@pytest.fixture
def app():
    return main.app


@pytest.fixture
def database():
    """
    Setup the test database.
    """
    test_db = SqliteDatabase(':memory:')
    test_db.bind([Message, HasTapped], bind_refs=False, bind_backrefs=False)
    test_db.connect()
    test_db.create_tables([Message, HasTapped])
    HasTapped.create(has_tapped=0)
