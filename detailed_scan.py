import pathlib
import re

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

for ctrl_path in controllers:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    print(f'\n{"="*70}')
    print(f'FILE: {ctrl_path}')
    print(f'{"="*70}')
    
    for i, line in enumerate(lines, 1):
        if '@Permissions' in line:
            start = max(0, i-3)
            end = min(len(lines), i+2)
            print(f'\nLine {i}: @Permissions found')
            for j in range(start, end):
                marker = '>>> ' if j == i-1 else '    '
                print(f'{marker}{j+1:4d}: {lines[j]}')
