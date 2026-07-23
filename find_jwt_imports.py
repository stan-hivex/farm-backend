import pathlib

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
    
    for i, line in enumerate(lines):
        if 'import' in line and 'JwtGuard' in line:
            print(f'{ctrl_path}:{i+1}')
            print(f'  Current: {line.strip()}')
            break
