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

all_fixes = []

for ctrl_path in controllers:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    has_permissions = any('@Permissions' in line for line in lines)
    if not has_permissions:
        continue
    
    has_rolesguard_class = any('@UseGuards' in line and 'RolesGuard' in line for line in lines)
    if has_rolesguard_class:
        continue
    
    for i, line in enumerate(lines):
        if '@UseGuards(JwtGuard)' in line and 'RolesGuard' not in line:
            old_line = line
            new_line = line.replace('@UseGuards(JwtGuard)', '@UseGuards(JwtGuard, RolesGuard)')
            all_fixes.append({
                'file': ctrl_path,
                'line_num': i + 1,
                'old': old_line,
                'new': new_line,
            })
            break

print(f'Total class-level @UseGuards(JwtGuard) to fix: {len(all_fixes)}\n')
for fix in all_fixes:
    print(f'{fix["file"]}:{fix["line_num"]}')
    print(f'  OLD: {fix["old"].strip()}')
    print(f'  NEW: {fix["new"].strip()}')
    print()
