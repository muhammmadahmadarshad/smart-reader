import { Button, Space, Tooltip } from 'antd';
import { CheckOutlined } from '@ant-design/icons';

export const annotationColors = [
  ['Yellow', '#F5E6A8'],
  ['Sage', '#CFE3C6'],
  ['Peach', '#F3D0B5'],
  ['Rose', '#ECCBD3'],
];
export function ColorPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <Space size={6} role="group" aria-label="Highlight color">
      {annotationColors.map(([name, color]) => (
        <Tooltip key={color} title={name}>
          <Button
            aria-label={`${name} highlight color`}
            aria-pressed={value === color}
            disabled={disabled}
            onClick={() => onChange(color)}
            style={{
              background: color,
              color: '#292D28',
              border: value === color ? '2px solid #35654D' : '1px solid #62685F',
              width: 36,
            }}
            icon={value === color ? <CheckOutlined /> : undefined}
          />
        </Tooltip>
      ))}
    </Space>
  );
}
