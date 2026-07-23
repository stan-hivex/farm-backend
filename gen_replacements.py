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

all_replacements = []

for ctrl_path in controllers:
    f = pathlib.Path(ctrl_path)
    text = f.read_text(encoding='utf-8')
    lines = text.split('\n')
    
    has_permissions = any('@Permissions' in line for line in lines)
    if not has_permissions:
        continue
    
    has_rolesguard = any('@UseGuards' in line and 'RolesGuard' in line for line in lines)
    if has_rolesguard:
        continue
    
    for i, line in enumerate(lines):
        if '@UseGuards(JwtGuard)' in line and 'RolesGuard' not in line:
            start = max(0, i-2)
            end = min(len(lines), i+3)
            context_before = '\n'.join(lines[start:i])
            context_after = '\n'.join(lines[i+1:end])
            
            old_str = '\n'.join(lines[start:end])
            new_str = old_str.replace('@UseGuards(JwtGuard)', '@UseGuards(JwtGuard, RolesGuard)')
            
            all_replacements.append({
                'filePath': str(pathlib.Path(ctrl_path)),
                'oldString': old_str,
                'newString': new_str,
                'line': i+1
            })
            break

import json
with open('replacements.json', 'w') as f:
    json.dump(all_replacements, f, indent=2)

print(f'Generated {len(all_replacements)} replacements')
print('Saved to replacements.json')
