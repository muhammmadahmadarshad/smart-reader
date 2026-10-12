import type { ThemeConfig } from 'antd';
export const colors = {
  primary: '#35654D',
  background: '#F6F3EC',
  surface: '#FFFDF8',
  reading: '#FAF7EF',
  text: '#292D28',
  secondary: '#62685F',
  border: '#DCDDD3',
  selected: '#E5EDE2',
  highlight: '#F5E6A8',
};
export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorInfo: colors.primary,
    colorLink: colors.primary,
    colorInfoBg: colors.selected,
    colorInfoBorder: colors.border,
    colorPrimaryBg: colors.selected,
    controlItemBgActive: colors.selected,
    colorBgLayout: colors.background,
    colorBgContainer: colors.surface,
    colorBgElevated: colors.surface,
    colorText: colors.text,
    colorTextSecondary: colors.secondary,
    colorBorder: colors.border,
    colorBorderSecondary: colors.border,
    borderRadius: 10,
    controlHeight: 40,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  components: {
    Menu: { itemSelectedBg: colors.selected, itemSelectedColor: colors.primary },
    Layout: { headerBg: colors.surface, siderBg: colors.surface },
    Button: { primaryShadow: 'none' },
    Select: { optionSelectedBg: colors.selected },
  },
};
