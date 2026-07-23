import pathlib
import json

controllers_imports = [
    ('src/auth/auth.controller.ts', 48),
    ('src/escrow/escrow.controller.ts', 5),
    ('src/investments/investments.controller.ts', 5),
    ('src/merchants/merchants.controller.ts', 5),
    ('src/payment-requests/payment-requests.controller.ts', 7),
    ('src/payments/payments.controller.ts', 7),
    ('src/projects/projects.controller.ts', 11),
    ('src/qr/qr.controller.ts', 5),
    ('src/security/security.controller.ts', 5),
    ('src/transactions/transactions.controller.ts', 4),
    ('src/transfer-requests/transfer-requests.controller.ts', 22),
    ('src/users/users.controller.ts', 27),
]

import_replacements = []

for ctrl_path, line_num in controllers_imports:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    jwt_line = lines[line_num - 1]
    
    start = max(0, line_num - 2)
    end = min(len(lines), line_num + 2)
    
    old_str = '\n'.join(lines[start:end])
    new_str = old_str.replace(
        jwt_line,
        jwt_line.rstrip(';') + ';\nimport { RolesGuard } from \'../common/guards/roles.guard\';'
    )
    
    import_replacements.append({
        'filePath': str(pathlib.Path(ctrl_path)),
        'oldString': old_str,
        'newString': new_str,
        'description': f'Add RolesGuard import to {ctrl_path}'
    })
    print(f'{ctrl_path} - Adding import at line {line_num}')

print(f'\nGenerated {len(import_replacements)} import replacements')
