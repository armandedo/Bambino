'use client';

import {
  MyBabyProfilesQuery,
  MyNotificationsQuery,
  MyOrdersQuery,
  MyPaymentMethodsQuery,
  OrderQuery,
} from '@bambino/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from './browser-api';

/** Query keys in one place, so a mutation can invalidate exactly what it changed. */
export const keys = {
  babies: ['babies'],
  orders: ['orders'],
  order: (id: string) => ['order', id],
  notifications: ['notifications'],
  paymentMethods: ['payment-methods'],
} as const;

export const useBabies = () =>
  useQuery({
    queryKey: keys.babies,
    queryFn: async () => (await api.request(MyBabyProfilesQuery)).myBabyProfiles,
  });

export const useOrders = () =>
  useQuery({
    queryKey: keys.orders,
    queryFn: async () =>
      (await api.request(MyOrdersQuery, { first: 50 })).myOrders.edges.map((edge) => edge.node),
  });

export const useOrder = (id: string) =>
  useQuery({ queryKey: keys.order(id), queryFn: async () => (await api.request(OrderQuery, { id })).order });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: async () => (await api.request(MyNotificationsQuery, { first: 10 })).myNotifications,
  });

export const usePaymentMethods = () =>
  useQuery({
    queryKey: keys.paymentMethods,
    queryFn: async () => (await api.request(MyPaymentMethodsQuery)).myPaymentMethods,
  });
