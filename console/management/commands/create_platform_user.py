import getpass

import pyotp
from django.core.management.base import BaseCommand, CommandError

from console.models import PlatformUser
from core import tenancy


class Command(BaseCommand):
    help = 'Create a Super Admin console user and print their authenticator (TOTP) setup link.'

    def add_arguments(self, parser):
        parser.add_argument('email')
        parser.add_argument('--name', required=True)
        parser.add_argument('--role', default='owner', choices=PlatformUser.ROLES)
        parser.add_argument('--password', help='Prompted when omitted')

    def handle(self, email, name, role, password=None, **options):
        password = password or getpass.getpass('Password: ')
        if len(password) < 12:
            raise CommandError('Use at least 12 characters for a Super Admin password.')
        with tenancy.platform_scope():
            if PlatformUser.objects.filter(email__iexact=email).exists():
                raise CommandError(f'{email} already exists.')
            user = PlatformUser(email=email, full_name=name, role=role, mfa_secret=pyotp.random_base32())
            user.set_password(password)
            user.save()
        uri = pyotp.TOTP(user.mfa_secret).provisioning_uri(name=email, issuer_name='AppDesko Super Admin')
        self.stdout.write(self.style.SUCCESS(f'Created {email} ({role}).'))
        self.stdout.write(f'Add to an authenticator app: {uri}')
