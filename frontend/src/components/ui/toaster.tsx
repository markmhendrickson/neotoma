import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { useOptionalLocale } from '@/i18n/LocaleContext';

export function Toaster() {
  const { toasts } = useToast();
  const spanish = useOptionalLocale()?.locale === 'es';

  return (
    <ToastProvider label={spanish ? 'Notificación' : 'Notification'}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport label={spanish ? 'Notificaciones ({hotkey})' : 'Notifications ({hotkey})'} />
    </ToastProvider>
  );
}

