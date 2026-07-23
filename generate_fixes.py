import pathlib
import re
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

fixes = []

for ctrl_path in controllers:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    perm_lines = []
    for i, line in enumerate(lines, 1):
        if '@Permissions' in line:
            perm_lines.append(i)
    
    if not perm_lines:
        continue
    
    for perm_line in perm_lines:
        for check_line in range(max(1, perm_line - 3), perm_line):
            line_text = lines[check_line - 1]
            if '@UseGuards(JwtGuard)' in line_text and 'RolesGuard' not in line_text:
                old = line_text
                new = line_text.replace('@UseGuards(JwtGuard)', '@UseGuards(JwtGuard, RolesGuard)')
                fixes.append({
                    'file': ctrl_path,
                    'line': check_line,
                    'old': old.strip(),
                    'new': new.strip(),
                    'perm_line': perm_line
                })
                break

print(f'Total fixes needed: {len(fixes)}\n')
for fix in fixes:
    print(f'{fix["file"]}:{fix["line"]} -> {fix["perm_line"]} (@Permissions)')
    print(f'  OLD: {fix["old"]}')
    print(f'  NEW: {fix["new"]}')
    print()
