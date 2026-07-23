import pathlib
import re

root = pathlib.Path('src')
problem = []

for f in sorted(root.rglob('*.controller.ts')):
    text = f.read_text(encoding='utf-8')
    
    has_permissions = re.search(r'@Permissions\(', text)
    has_jwt_guard = re.search(r'@UseGuards\(JwtGuard\)', text)
    has_jwt_roles = re.search(r'@UseGuards\(JwtGuard,\s*RolesGuard\)', text)
    has_roles_guard = re.search(r'@UseGuards\(RolesGuard\)', text)
    has_auth_guard = re.search(r"@UseGuards\(AuthGuard\('jwt'\)\)", text)
    
    if has_permissions and has_jwt_guard and not has_jwt_roles and not has_roles_guard:
        problem.append(str(f.relative_to(root.parent)))

for p in problem:
    print(p)
print(f'\nTOTAL: {len(problem)} controllers need RolesGuard')
