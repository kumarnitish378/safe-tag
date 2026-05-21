"""Shared Flask extension instances. Imported by app factory and modules."""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from flask_migrate import Migrate

from models import db

migrate = Migrate()
mail = Mail()
limiter = Limiter(key_func=get_remote_address, default_limits=["1000 per hour"])
