import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../../common/guards/tenant-membership.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  ApproveReturnRequestDto,
  CreateReturnRequestDto,
  RejectReturnRequestDto,
} from './dto/create-return-request.dto';
import { ReturnsService } from './returns.service';

@Controller('returns')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.returnsService.findAll(tenantId, user, status);
  }

  @Get('invoice-lookup')
  lookupInvoice(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q = '',
  ) {
    return this.returnsService.lookupInvoice(tenantId, user, q);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnsService.create(tenantId, user, dto);
  }

  @Post(':id/approve')
  approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveReturnRequestDto,
  ) {
    return this.returnsService.approve(tenantId, user, id, dto);
  }

  @Post(':id/reject')
  reject(
    @TenantId() tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnRequestDto,
  ) {
    return this.returnsService.reject(tenantId, user, id, dto);
  }
}
