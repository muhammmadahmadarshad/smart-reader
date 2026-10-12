import { App, Avatar, Button, Dropdown, Layout, Menu } from 'antd';
import { BookOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api, queryClient } from '../api';
import { useUser } from '../auth/Auth';
export default function Shell() {
  const { data: user } = useUser();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
    onError: (error) => message.error(error.message),
  });
  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <Link to="/library" className="wordmark">
          <BookOutlined /> Smart Reader
        </Link>
        <Menu
          mode="horizontal"
          selectedKeys={['library']}
          items={[{ key: 'library', label: <Link to="/library">My library</Link> }]}
        />
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'email', label: user?.email, disabled: true },
              { type: 'divider' },
              {
                key: 'logout',
                label: 'Log out',
                icon: <LogoutOutlined />,
                disabled: logout.isPending,
                onClick: () => logout.mutate(),
              },
            ],
          }}
        >
          <Button className="profile-button" type="text" aria-label="Open profile menu">
            <Avatar size="small" icon={<UserOutlined />} />
            <span className="profile-email">{user?.email}</span>
          </Button>
        </Dropdown>
      </Layout.Header>
      <Layout.Content>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
