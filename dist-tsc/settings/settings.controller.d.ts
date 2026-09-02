import { SettingsService } from './settings.service';
declare class UpdateLanguageDto {
    language: string;
}
declare class UpdateThemeDto {
    theme: string;
}
export declare class SettingsController {
    private readonly settingsService;
    constructor(settingsService: SettingsService);
    updateLanguage(req: any, dto: UpdateLanguageDto): Promise<{
        success: boolean;
        message: string;
    }>;
    updateTheme(req: any, dto: UpdateThemeDto): Promise<{
        success: boolean;
        message: string;
    }>;
}
export {};
