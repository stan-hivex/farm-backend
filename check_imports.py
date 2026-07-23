import pathlib
import json

controllers = [
    'src/auth/auth.controller.ts',
    'src/escrow/escrow.controller.ts',
    'src/investments/investments.controller.ts',
    'src/merchants/merchants.controller.ts',
    'src/payment-requests/payment-requests.controller.ts',
    'src/payments/payments.controller.ts',
    'src/projects/projects.controller.ts',
    'src/qr/qr.controller.ts',
    'src/security/security.controller.ts',
    'src/transactions/transactions.controller.ts',
    'src/transfer-requests/transfer-requests.controller.ts',
    'src/users/users.controller.ts',
]

import_fixes = []

for ctrl_path in controllers:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    
    has_rolesguard_import = 'RolesGuard' in text
    
    if not has_rolesguard_import:
        import_fixes.append(ctrl_path)
        print(f'{ctrl_path} - MISSING RolesGuard import')

print(f'\nTotal files needing RolesGuard import: {len(import_fixes)}')
